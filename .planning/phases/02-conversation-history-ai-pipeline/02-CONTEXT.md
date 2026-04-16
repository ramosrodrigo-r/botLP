# Phase 2: Conversation History + AI Pipeline - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Pipeline completo de conversa multi-turno: mensagem WhatsApp chega → histórico carrega com mutex lock → OpenAI chamada com contexto completo → resposta enviada ao lead via Digisac → histórico atualizado. Inclui expiração de sessão por TTL de inatividade, fallback para erro 429 da OpenAI, e system prompt que guia a IA a coletar qualificação do lead naturalmente ao longo da conversa.

Requisitos cobertos: CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05.

</domain>

<decisions>
## Implementation Decisions

### Mutex por contactId (CONV-02)

- **D-01:** Usar o pacote **`async-mutex`** para mutex por contactId — simples, explícito, testado para esse padrão em Node.js. Alternativa (Promise-queue manual) foi considerada, mas `async-mutex` é preferida pela clareza.
- **D-02:** Ciclo de vida dos mutexes: **lazy removal após release**. Após cada acquire/release, verificar se o mutex está idle e removê-lo do Map. Sem setInterval. Consistente com a lazy eviction do dedup (D-09 da Fase 1).

### Histórico de Conversa + TTL de Sessão (CONV-01)

- **D-03:** TTL de **24h de inatividade** implementado via **lazy check na próxima mensagem**. Ao receber mensagem, verificar se o último acesso do contactId foi há mais de 24h. Se sim, resetar histórico + estado de consentimento LGPD e iniciar sessão nova. Consistente com D-09 (lazy eviction) — sem setInterval.
- **D-04:** Ao expirar TTL, **tudo expira junto**: histórico de mensagens + flag `consentGiven`. O lead recebe disclosure e LGPD novamente na próxima sessão. Comportamento previsível e seguro.
- **D-05:** Histórico limitado a **20 mensagens** (10 trocas) — já implementado em `aiService.ts`. Manter esse limite; não alterar.

### AI Pipeline (CONV-03, CONV-04)

- **D-06:** Wiring do pipeline na `webhookHandler.ts` no ponto já marcado como `// Phase 2: wire AI pipeline here`. Sequência: `getAIResponse(contactId, msg.text)` → `appendDisclaimer(aiReply)` → `sendMessage(contactId, ...)`.
- **D-07:** System prompt via env var `SYSTEM_PROMPT` (já implementado em `aiService.ts`). Sem alterações nesse mecanismo.

### Lead Qualification — System Prompt Only (QUAL-01 a QUAL-05)

- **D-08:** Qualificação **via system prompt apenas** — sem extração de dados em código, sem marcadores, sem segunda chamada à OpenAI. O prompt instrui a IA a coletar nome, área jurídica, urgência e intenção de contratar progressivamente ao longo da conversa, de forma natural (não formulário).
- **D-09:** System prompt de exemplo com **áreas jurídicas genéricas** (trabalhista, família, cível, criminal) como placeholder. O escritório substitui o texto real via `SYSTEM_PROMPT` env var antes do deploy em produção, sem re-deploy.

### 429 Fallback (CONV-05)

- **D-10:** Ao receber erro 429 da OpenAI: enviar **mensagem de fallback ao lead** + **log estruturado pino nível `warn`** com `contactId` e timestamp. Sem estado extra em código — admin consulta logs do Railway para follow-up manual.
- **D-11:** Mensagem de fallback configurável via env var **`OPENAI_FALLBACK_MESSAGE`**. Consistente com a abordagem das mensagens de compliance (D-02 da Fase 1). Placeholder default em português caso a env var não esteja definida.

### Claude's Discretion

- Estrutura interna do Map de sessão (objeto com `history`, `consentGiven`, `lastAccessAt` vs. Maps separados)
- Implementação exata do lock/unlock do async-mutex (try/finally pattern)
- Campo exato de timestamp para TTL (ISO string vs. epoch ms)
- Formato do log warn para 429 (campos além de contactId e timestamp)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Referência técnica da integração
- `DIGISAC_IA_INTEGRATION.md` — Guia completo de integração: payload do webhook (seção 8.5), endpoints Digisac (seção 8), env vars de referência (seção 7)

### Stack e bibliotecas
- `CLAUDE.md` — Stack mandatória, padrões de código, e lista de pacotes proibidos. **Nota:** `async-mutex` foi decidido neste contexto e é permitido apesar de não estar listado originalmente.

### Requisitos
- `.planning/REQUIREMENTS.md` — Critérios de aceitação para CONV-01 a CONV-05 e QUAL-01 a QUAL-05
- `.planning/ROADMAP.md` — Success criteria da Fase 2 (5 critérios verificáveis)
- `.planning/PROJECT.md` — Constraints de segurança, ética/legal, decisões de arquitetura

### Fase anterior
- `.planning/phases/01-webhook-infrastructure-compliance-foundation/01-CONTEXT.md` — Decisões D-01 a D-09 que continuam vigentes (lazy eviction, compliance flow, estrutura de arquivos)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/aiService.ts` — Skeleton já existe: Map de histórico, `getAIResponse(contactId, userMessage)`, trim de 20 mensagens, chamada `client.chat.completions.create()`. Esta função será expandida (TTL, mutex), não reescrita.
- `src/services/complianceService.ts` — `runComplianceFlow(contactId)` já retorna `boolean`. O estado de consentimento LGPD já existe por contactId.
- `src/services/digisacService.ts` — `sendMessage(contactId, text)` já implementado.
- `src/utils/env.ts` — Zod schema de env vars já existe. Adicionar `SYSTEM_PROMPT` (já lá), `OPENAI_FALLBACK_MESSAGE`, e verificar se `OPENAI_MODEL` está mapeado.

### Established Patterns
- Lazy eviction sem setInterval (D-09 da Fase 1) — manter o mesmo padrão para TTL
- Env vars para textos configuráveis (D-02 da Fase 1) — manter para `OPENAI_FALLBACK_MESSAGE`
- `logger.child({ contactId })` para logging com contexto (padrão estabelecido em `webhookHandler.ts`)

### Integration Points
- `src/handlers/webhookHandler.ts` linha `// Phase 2: wire AI pipeline here.` — ponto exato de wiring do pipeline
- O estado de sessão (histórico + consentimento + TTL) deve ser consolidado — atualmente `complianceService.ts` guarda `consentGiven` separado de `aiService.ts` que guarda `histories`. Fase 2 deve unificar ou coordenar esses dois Maps para que o TTL funcione consistentemente.

</code_context>

<specifics>
## Specific Ideas

- O ponto de wiring em `webhookHandler.ts` já tem o comentário exato: `const aiReply = await getAIResponse(contactId, msg.text); await sendMessage(contactId, appendDisclaimer(aiReply));`
- A unificação do estado de sessão (histories + consentGiven + lastAccessAt) em um único Map de objetos `SessionState` em `aiService.ts` (ou em um novo `sessionService.ts`) evita dessincronização entre os dois serviços ao expirar TTL
- `async-mutex` expõe `Mutex` com `.acquire()` que retorna um `release()` callable — padrão try/finally garante unlock mesmo em erros

</specifics>

<deferred>
## Deferred Ideas

- Texto final aprovado pelo escritório para `SYSTEM_PROMPT` — revisão com stakeholder antes do deploy em produção (já registrado no STATE.md)
- Estruturação de dados de qualificação (nome, área, urgência, intenção como campos extraídos) — decidido não fazer na Fase 2; pode ser adicionado na Fase 3 (handoff) se o advogado precisar de um resumo estruturado
- `OPENAI_FALLBACK_MESSAGE` como env var obrigatória vs. opcional com default — deixar para o planner decidir (razoável como opcional com default em português)

</deferred>

---

*Phase: 02-conversation-history-ai-pipeline*
*Context gathered: 2026-04-16*
