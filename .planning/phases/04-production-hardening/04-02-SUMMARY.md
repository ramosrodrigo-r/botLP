---
phase: 04-production-hardening
plan: "02"
subsystem: infra
tags: [railway, deploy, healthcheck, sigterm, env-example, sandbox]

requires:
  - phase: 04-production-hardening/04-01
    provides: GET /health endpoint, 0.0.0.0 bind, SANDBOX_MODE/SANDBOX_NUMBERS env vars, Guard 0

provides:
  - railway.json com healthcheckPath=/health, healthcheckTimeout=60, startCommand=npx tsx src/server.ts, restartPolicyType=ON_FAILURE
  - .env.example completo com 16 env vars incluindo bloco Sandbox (Phase 4) comentado
  - Artefatos de configuracao de deploy prontos para uso pelo desenvolvedor no Railway dashboard

affects:
  - 04-03-compliance-golive (consumes artefatos de deploy; SANDBOX_MODE permanece true ate gates 04-03 completarem)

tech-stack:
  added: []
  patterns:
    - "railway.json com startCommand npx tsx (nao npm start) — entrega SIGTERM diretamente ao processo Node, evitando intercepcao pelo npm"
    - ".env.example como fonte de verdade de todas as env vars — atualizado a cada phase que adiciona variaveis"

key-files:
  created:
    - railway.json
  modified:
    - .env.example

key-decisions:
  - "startCommand usa 'npx tsx src/server.ts' (nao 'npm start') — npm interceptaria SIGTERM como PID 1, o handler em server.ts nunca executaria"
  - "healthcheckTimeout=60 (nao default 300s do Railway) — falha rapida se boot quebrar; tsx cold-start real e ~2s"
  - "restartPolicyType=ON_FAILURE + maxRetries=3 — recupera crashes transientes sem mascarar bugs persistentes"
  - "Task 3 (Railway dashboard setup) aprovada pelo desenvolvedor como checkpoint externo — railway.json e .env.example commitados; configuracao do dashboard (volume, env vars, dominio) a ser feita externamente"
  - "SANDBOX_MODE permanece true ao fim deste plano — desativacao somente apos gates de compliance em 04-03"

patterns-established:
  - "railway.json como contrato declarativo de deploy — campos de healthcheck e startCommand versionados no repo, nao apenas no dashboard"

requirements-completed: []

duration: ~10min (tasks 1-2 auto) + checkpoint humano Task 3
completed: 2026-04-17
---

# Phase 4 Plan 02: Deploy Railway - Configuracao de Artefatos Summary

**railway.json com healthcheck (/health, 60s) e startCommand SIGTERM-safe (npx tsx) + .env.example com 16 vars incluindo bloco Sandbox comentado — artefatos de deploy prontos; configuracao do Railway dashboard pendente de acao do desenvolvedor**

## Performance

- **Duration:** ~10 min (tasks automaticas) + checkpoint humano aprovado externamente
- **Started:** 2026-04-17T23:20:00Z (estimado, apos 04-01)
- **Completed:** 2026-04-17
- **Tasks:** 3 (2 auto + 1 checkpoint humano aprovado)
- **Files modified:** 2

## Accomplishments

- `railway.json` criado na raiz do repo com `startCommand: "npx tsx src/server.ts"` — garante que SIGTERM do Railway e entregue diretamente ao processo Node (handler `shutting down` em server.ts executara durante redeploy)
- `healthcheckPath: "/health"` aponta para o endpoint criado em 04-01 antes do rate-limit middleware — Railway poller nao recebe 429
- `.env.example` atualizado com todas as 16 env vars, incluindo novo bloco `# Sandbox (Phase 4 — D-11/D-12)` com comentarios explicando quando desativar `SANDBOX_MODE`
- Checkpoint humano (Task 3) aprovado pelo desenvolvedor: "approved — deploy marcado, seguir para 04-03". Configuracao do Railway dashboard (volume /data, env vars, dominio publico) sera realizada externamente pelo desenvolvedor antes do go-live

## Task Commits

1. **Task 1: Criar railway.json** - `0e940fe` (feat)
2. **Task 2: Atualizar .env.example** - `5ddf5d9` (chore)
3. **Task 3: Checkpoint humano — aprovado** - nenhum commit de repo (acoes externas no Railway dashboard)

## Files Created/Modified

- `railway.json` — Configuracao de deploy Railway: `startCommand: "npx tsx src/server.ts"`, `healthcheckPath: "/health"`, `healthcheckTimeout: 60`, `restartPolicyType: "ON_FAILURE"`, `restartPolicyMaxRetries: 3`. Sem Dockerfile nem nixpacks.toml — Railpack detecta Node.js automaticamente via `engines.node` no package.json
- `.env.example` — Adicionado bloco `# Sandbox (Phase 4 — D-11/D-12)` com `SANDBOX_MODE=false` e `SANDBOX_NUMBERS=` (com valor false como placeholder seguro de referencia), precedido de comentarios explicando comportamento do Guard 0 e quando desabilitar

## Decisions Made

- `npx tsx src/server.ts` como startCommand (nao `npm start`) — npm viraria PID 1 no container e interceptaria SIGTERM antes que chegasse ao processo Node, o handler `shutting down` em server.ts nunca executaria; Railway daria SIGKILL apos o drain timeout. Pitfall 3 do RESEARCH.md.
- `healthcheckTimeout: 60` (explicito) em vez do default de 300s do Railway — cold-start real do tsx e ~2s; falha em 60s detecta boot quebrado rapidamente sem esperar 5 minutos
- `restartPolicyMaxRetries: 3` — limite evita restart loop infinito em caso de bug persistente pós-deploy

## Railway Dashboard Setup Pendente (Acao do Desenvolvedor)

O Task 3 foi aprovado como checkpoint externo. As seguintes acoes no Railway dashboard estao pendentes ate o go-live:

**Itens a configurar no Railway:**
1. Criar projeto Railway conectado ao repositorio GitHub
2. Adicionar volume persistente com `Mount Path = /data` (para `paused.json` sobreviver a redeploys — HAND-04)
3. Configurar as 16 env vars no dashboard (referencia: `.env.example`), iniciando com `SANDBOX_MODE=true` e `SANDBOX_NUMBERS=<contactId de teste>`
4. Gerar dominio publico (Settings → Networking → Generate Domain)
5. Validar `/health` via `curl https://<url>/health` — esperado: `{"status":"ok","uptime":<numero>}` HTTP 200
6. Confirmar SIGTERM nos logs de redeploy: linha `{"msg":"shutting down","signal":"SIGTERM"}` deve aparecer antes do novo container iniciar
7. Confirmar persistencia do volume: `paused.json` sobrevive a redeploy

**Status das validacoes de deploy:**
- `/health` curl: pendente (Railway nao configurado ainda)
- SIGTERM graceful shutdown: pendente
- Volume `/data` persistente: pendente
- Logs pino estruturados no Railway viewer: pendente

## Deviations from Plan

None - plano executado exatamente como especificado. Tasks 1 e 2 entregues conforme `must_haves.artifacts`. Task 3 e checkpoint humano; sinal de aprovacao recebido ("approved — deploy marcado, seguir para 04-03").

## Issues Encountered

None — tasks automaticas executaram sem problemas. Checkpoint humano aprovado sem revisao necessaria.

## User Setup Required

**Configuracao externa necessaria antes do go-live.** Ver lista em "Railway Dashboard Setup Pendente" acima.

Env vars necessarias no Railway dashboard (sem valores sensiveis — apenas nomes):
- `DIGISAC_API_URL`, `DIGISAC_API_TOKEN`, `DIGISAC_SERVICE_ID`, `WEBHOOK_SECRET`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_FALLBACK_MESSAGE`
- `DISCLOSURE_MESSAGE`, `LGPD_CONSENT_MESSAGE`, `LEGAL_DISCLAIMER`, `SYSTEM_PROMPT`
- `URGENCY_KEYWORDS`, `HANDOFF_MESSAGE`
- `PAUSED_STATE_FILE=/data/paused.json`
- `SANDBOX_MODE=true` (manter true ate 04-03 gates completarem)
- `SANDBOX_NUMBERS=<contactId de teste Digisac>`
- `NODE_ENV=production`
- `PORT` — **NAO configurar**: Railway injeta automaticamente

## Next Phase Readiness

- `railway.json` e `.env.example` commitados e prontos
- Plano 04-03 (compliance docs + go-live checklist + testes adversariais) pode iniciar enquanto o desenvolvedor configura o Railway dashboard em paralelo
- `SANDBOX_MODE=true` permanece ativo — desativacao somente apos 04-03 completar gates D-13 (testes adversariais) e aprovacao dos textos de compliance pelo escritorio
- Bloqueador para go-live: configuracao do Railway dashboard (volume, env vars, dominio) ainda pendente de acao do desenvolvedor

---
*Phase: 04-production-hardening*
*Completed: 2026-04-17*
