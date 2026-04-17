---
phase: 04-production-hardening
plan: "01"
subsystem: infra
tags: [railway, health-check, sandbox, express, zod, env-validation]

requires:
  - phase: 03-handoff-persistence
    provides: loadFromDisk/handoffService, paused state on restart, PAUSED_STATE_FILE env var

provides:
  - GET /health endpoint returning {status, uptime} without rate-limit throttle
  - app.listen bound to 0.0.0.0 for Railway container compatibility
  - SANDBOX_MODE and SANDBOX_NUMBERS in Zod env schema with safe defaults
  - Guard 0 sandbox filter as first guard in webhookHandler chain

affects:
  - 04-02-deploy-railway (consumes /health for health check configuration and needs 0.0.0.0 bind)

tech-stack:
  added: []
  patterns:
    - "Guard 0 pattern: cheapest filter (string Set lookup) placed as first guard before all logic"
    - "Health check registered before rate-limit middleware to prevent 429 on Railway poller"
    - "Sandbox numbers parsed once at module load as Set<string> for O(1) lookup — same idiom as urgencyKeywords"

key-files:
  created: []
  modified:
    - src/utils/env.ts
    - src/server.ts
    - src/handlers/webhookHandler.ts

key-decisions:
  - "GET /health registered BEFORE rateLimit middleware — Railway poller calls repeatedly and would hit 429"
  - "app.listen binds to 0.0.0.0 explicitly — default OS bind may restrict to 127.0.0.1 inside Railway container"
  - "z.coerce.boolean() used for SANDBOX_MODE — Zod v4 coerce verified in research (A2); converts string 'true'/'false' from env"
  - "sandboxContactId local var (not contactId) avoids collision with contactId declared 30 lines later in chain"
  - "Guard 0 extracts contactId via same (payload.data as Record<string,unknown>)['contactId'] cast as Guard 6 — CR-01 acknowledged"

patterns-established:
  - "Guard 0 pattern: sandbox filter as first guard in handleWebhookAsync, before event type checks"
  - "Module-load Set<string> parse for O(1) lookup — established for urgencyKeywords (Phase 3), extended to sandboxNumbers"

requirements-completed: []

duration: 8min
completed: 2026-04-17
---

# Phase 4 Plan 01: Production Hardening - Code Instrumentation Summary

**GET /health (pre-rate-limit) + Guard 0 sandbox filter (Set<string>) + 0.0.0.0 bind instrumentam a aplicacao para deploy no Railway sem alterar requisitos funcionais existentes**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-17T23:20:03Z
- **Completed:** 2026-04-17T23:28:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `GET /health` registrado antes do `rateLimit()` — Railway poller nao recebe 429, deploy nao falha
- `app.listen(env.PORT, '0.0.0.0', ...)` — bind explicito previne "Application failed to respond" no container Railway
- `SANDBOX_MODE` e `SANDBOX_NUMBERS` validados no Zod schema com defaults seguros (`false` / `''`)
- Guard 0 descarta silenciosamente contactIds fora da lista de teste quando `SANDBOX_MODE=true`, sem afetar fluxo de producao
- Boot local confirmado: `curl http://127.0.0.1:3010/health` retornou `{"status":"ok","uptime":3.06}` com HTTP 200

## Task Commits

1. **Task 1: SANDBOX_MODE e SANDBOX_NUMBERS no Zod schema** - `5c7f1d3` (feat)
2. **Task 2: GET /health e bind 0.0.0.0 em server.ts** - `d902fe9` (feat)
3. **Task 3: Guard 0 sandbox em webhookHandler.ts** - `c57bceb` (feat)

## Files Created/Modified

- `src/utils/env.ts` — Adicionado bloco `// Sandbox (Phase 4 — D-11)` com `SANDBOX_MODE: z.coerce.boolean().default(false)` e `SANDBOX_NUMBERS: z.string().default('')`, inseridos apos `PAUSED_STATE_FILE` e antes de `// Server`
- `src/server.ts` — Inserido `app.get('/health', ...)` entre `helmet()` e `rateLimit()`; alterado `app.listen` para `app.listen(env.PORT, '0.0.0.0', ...)`
- `src/handlers/webhookHandler.ts` — Adicionado parse de `sandboxNumbers: Set<string>` apos `urgencyKeywords`; inserido Guard 0 como primeiro guard em `handleWebhookAsync`

## Decisions Made

- `z.coerce.boolean()` para `SANDBOX_MODE` — confirmado suportado em Zod v4 (research A2); converte `'true'`/`'1'` de env var para boolean sem `.transform()`
- Variavel local `sandboxContactId` (nao `contactId`) — evita colisao com `const contactId` declarada ~30 linhas abaixo na chain apos validacoes de guardas 1-5
- `logger` (top-level) no Guard 0, nao `log` (child) — child logger `log` so e criado apos Guards 1-5 passarem; Guard 0 executa antes disso
- Guard 0 descarta `undefined` contactId silenciosamente — payload de ping/teste sem o campo nao e erro (RESEARCH Pitfall 5)

## Deviations from Plan

None - plano executado exatamente como especificado. Todos os tres artefatos entregues conforme `must_haves.artifacts`.

## Issues Encountered

- Primeiro boot de teste falhou porque `WEBHOOK_SECRET=secret12345678` tem apenas 14 caracteres (schema exige minimo 16). Corrigido nos parametros do segundo teste — nao e bug, e a validacao Zod funcionando corretamente.

## User Setup Required

None — nenhuma configuracao externa necessaria para este plano. As novas env vars `SANDBOX_MODE` e `SANDBOX_NUMBERS` tem defaults que funcionam sem configuracao adicional.

## Next Phase Readiness

- `GET /health` pronto para configurar Railway health check poller (plano 04-02)
- Bind em `0.0.0.0` previne falha de startup no container Railway
- `SANDBOX_MODE=true` + `SANDBOX_NUMBERS=<contactId>` permite testar fluxo completo no Railway com trafego Digisac real antes do go-live (D-12)
- Nenhum bloqueador para plano 04-02 (deploy Railway)

---
*Phase: 04-production-hardening*
*Completed: 2026-04-17*
