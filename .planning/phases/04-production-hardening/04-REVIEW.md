---
phase: 04-production-hardening
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/utils/env.ts
  - src/server.ts
  - src/handlers/webhookHandler.ts
  - railway.json
  - .env.example
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Os cinco arquivos da Fase 4 (sandbox guard, `/health` endpoint, `railway.json`, schema Zod atualizado e `.env.example`) foram revisados em profundidade. Nenhum problema crítico foi encontrado — a base é sólida. Foram identificados três avisos (Warnings) que podem causar bugs em situações de borda, e quatro itens informativos (Info) de qualidade de código sem risco imediato.

O Guard 0 de sandbox está correto em conceito, mas há uma inconsistência de posicionamento na chain descrita nos JSDoc versus a ordem real de execução (WR-01 abaixo). O endpoint `/health` expõe `uptime` em texto claro — aceitável, mas documentado como ponto de atenção. O `startCommand` do `railway.json` usa `npx tsx` em vez de `tsx` direto, o que pode causar lentidão no cold start do Railway.

---

## Warnings

### WR-01: Guard 0 (sandbox) extrai `contactId` via cast independente do Guard após Guard 5

**File:** `src/handlers/webhookHandler.ts:92-100`

**Issue:** O Guard 0 extrai `contactId` com um cast direto em `payload.data` antes do Guard 1 (`event !== 'message.created'`). Payloads de eventos que não sejam `message.created` (por exemplo, `contact.updated`, `ticket.assigned`) têm estruturas de `data` completamente diferentes — `data.contactId` pode existir nesses eventos com semântica diferente (p.ex., contactId do contato alvo de uma atualização, não de uma mensagem). O Guard 0 poderia inadvertidamente **permitir** que um evento não-mensagem de um contactId sandbox passe o Guard 0 e depois seja descartado pelo Guard 1 — isso não causa bug, mas também poderia **bloquear** um evento de sistema legítimo (como um webhook de health check do próprio Digisac) que não carrega `contactId`, sendo descartado antes de qualquer logging estruturado.

O problema real: se `sandboxContactId` for `undefined` (payload sem `contactId`), o código faz `return` silencioso — descartando inclusive eventos de controle que *não são mensagens* e que o servidor pode precisar processar no futuro (p.ex., confirmações de leitura). A lógica deveria permitir que eventos sem `contactId` passem pelo Guard 0 e sejam tratados (e descartados) pelos guards corretos (Guard 1).

**Fix:**
```typescript
// Guard 0: sandbox — aplicar SOMENTE após Guard 1 confirmar event === 'message.created',
// ou, alternativamente, pular o Guard 0 quando não houver contactId no payload:
if (env.SANDBOX_MODE) {
  const sandboxContactId =
    (payload.data as Record<string, unknown>)['contactId'] as string | undefined;
  // Se não há contactId, não é uma mensagem de usuário — deixa os guards
  // subsequentes decidirem (p.ex., Guard 1 vai descartar eventos não-message.created).
  if (sandboxContactId !== undefined && !sandboxNumbers.has(sandboxContactId)) {
    logger.debug(
      { event: 'sandbox_blocked', contactId: sandboxContactId },
      'discarded: sandbox mode active',
    );
    return;
  }
}
```

---

### WR-02: `SANDBOX_MODE` usa `z.coerce.boolean()` — interpreta string `"false"` como `true`

**File:** `src/utils/env.ts:52`

**Issue:** `z.coerce.boolean()` do Zod converte via `Boolean(value)`, o que significa que qualquer string não-vazia — incluindo `"false"`, `"0"`, `"no"` — é coercida para `true`. Se alguém colocar `SANDBOX_MODE=false` no `.env` de produção do Railway (como está em `.env.example`), o Zod irá interpretar a string `"false"` como `true`, ativando o sandbox inadvertidamente e bloqueando todas as mensagens de leads reais.

```
z.coerce.boolean().parse("false") // => true  ← BUG
z.coerce.boolean().parse("")      // => false  ← ok
z.coerce.boolean().parse("true")  // => true   ← ok
```

**Fix:** Usar um transform explícito que trate os valores esperados como variáveis de ambiente:
```typescript
SANDBOX_MODE: z
  .string()
  .default('false')
  .transform((val) => val.toLowerCase() === 'true'),
```

Isso garante que `"false"`, `"0"`, `""`, qualquer outra string → `false`; somente `"true"` → `true`.

---

### WR-03: `railway.json` usa `npx tsx` como `startCommand` — potencial timeout de cold start

**File:** `railway.json:4`

**Issue:** `"startCommand": "npx tsx src/server.ts"` faz o Railway executar o `npx` a cada restart/deploy, o que inclui uma resolução de pacote e potencialmente um download de rede se `tsx` não estiver cacheado. O `healthcheckTimeout` está em 60 segundos — em deploys normais isso é suficiente, mas em containers limpos (sem cache npm) o `npx` pode acrescentar 10-30s ao cold start, estreitando a margem de segurança.

Além disso, `tsx` já está declarado como devDependency em `package.json` (pressuposto pela stack do CLAUDE.md), logo o binário está disponível em `node_modules/.bin/tsx` e pode ser chamado diretamente.

**Fix:**
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "startCommand": "node --import tsx/esm src/server.ts",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

Alternativamente, se o `package.json` tiver um script `"start"`:
```json
"startCommand": "npm start"
```

---

## Info

### IN-01: `/health` expõe `uptime` sem autenticação — disclosure mínimo mas documentado

**File:** `src/server.ts:41-43`

**Issue:** O endpoint `GET /health` retorna `{ status: 'ok', uptime: <segundos> }` sem nenhuma proteção. O `uptime` revela há quanto tempo o servidor está rodando, o que pode ajudar um atacante a correlacionar eventos (p.ex., "o servidor reiniciou às 14h32"). Em contexto de escritório de advocacia com dados de clientes, qualquer vazamento de metadados operacionais deve ser avaliado.

Não é um bug funcional, mas é uma prática de hardening que vale considerar antes do go-live.

**Fix (opção mínima):** Remover `uptime` da resposta pública e expô-lo apenas em logs internos:
```typescript
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

---

### IN-02: `OPENAI_API_KEY` validado com `.startsWith('sk-')` — pode rejeitar chaves de projeto (sk-proj-)

**File:** `src/utils/env.ts:17`

**Issue:** A validação `z.string().startsWith('sk-', ...)` cobre chaves padrão (`sk-...`) mas também aceita chaves de projeto da OpenAI (`sk-proj-...`), pois ambas começam com `sk-`. Isso não é um bug atualmente, mas se a OpenAI introduzir novos formatos de chave no futuro (p.ex., `key-...`), a validação rejeitaria chaves válidas e causaria falha na startup. O comentário `// Phase 2` sugere que essa validação não foi revisada desde a fase 2.

Sugestão de relaxamento defensivo:
```typescript
OPENAI_API_KEY: z.string().min(20, 'OPENAI_API_KEY parece inválida (muito curta)'),
```

---

### IN-03: `SANDBOX_NUMBERS` vazio com `SANDBOX_MODE=true` bloqueia todas as mensagens — comportamento intencional mas não validado

**File:** `src/utils/env.ts:53` e `src/handlers/webhookHandler.ts:48-53`

**Issue:** O comentário em `.env.example` afirma que `SANDBOX_NUMBERS` vazio com `SANDBOX_MODE=true` "bloqueia TODAS as mensagens (comportamento intencional)". Porém, o schema Zod não valida essa combinação — não há aviso ao operador se `SANDBOX_MODE=true` e `SANDBOX_NUMBERS=''`. Em produção, isso causaria silêncio total (nenhum lead recebe resposta) sem nenhum alerta de startup.

**Fix:** Adicionar validação cruzada no schema Zod:
```typescript
EnvSchema.refine(
  (data) => !data.SANDBOX_MODE || data.SANDBOX_NUMBERS.trim().length > 0,
  {
    message: 'SANDBOX_MODE=true requer pelo menos um contactId em SANDBOX_NUMBERS',
    path: ['SANDBOX_NUMBERS'],
  },
);
```

Ou pelo menos um `logger.warn` na startup quando a combinação for detectada.

---

### IN-04: `msg.text` acessado sem verificar existência antes do Guard 5

**File:** `src/handlers/webhookHandler.ts:138`

**Issue:** O Guard 3 filtra `msg.type !== 'chat'`, mas o acesso `msg.text.trim()` no Guard 5 assume que `msg.text` existe e é string. O tipo `msg.text` pode ser `string | undefined` ou `null` dependendo do SDK — se o Digisac enviar um `chat`-type com campo `text` ausente (edge case de payload malformado), isso causaria um `TypeError: Cannot read properties of undefined (reading 'trim')`, que jogaria uma exceção dentro do `handleWebhookAsync` e seria capturada no handler de rota como erro 500.

**Fix:** Usar optional chaining:
```typescript
if (!msg.text?.trim()) {
  logger.debug({ messageId: msg.id }, 'discarded: empty text body');
  return;
}
```

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
