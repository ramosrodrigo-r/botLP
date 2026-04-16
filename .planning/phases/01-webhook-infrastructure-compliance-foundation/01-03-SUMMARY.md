---
phase: 01-webhook-infrastructure-compliance-foundation
plan: "03"
subsystem: webhook-layer
tags: [express, webhook, security, rate-limit, helmet, guard-chain, dedup, checkpoint]
status: awaiting-human-verification

dependency_graph:
  requires:
    - 01-01 (env.ts, logger.ts, types/digisac.ts)
    - 01-02 (complianceService.ts, digisacService.ts)
  provides:
    - Express server on env.PORT with full middleware chain
    - POST /digisac/webhook route with token validation
    - Webhook guard chain + dedup + compliance dispatch
  affects:
    - Phase 2 AI pipeline (wires into handler anchor comment)

tech_stack:
  patterns:
    - Express 5 middleware chain (helmet → rateLimit → json → httpLogger → router)
    - crypto.timingSafeEqual for constant-time token comparison
    - setImmediate fire-and-forget for HTTP response decoupling
    - Map-based dedup with lazy eviction (no setInterval)

key_files:
  created:
    - src/handlers/webhookHandler.ts
    - src/routes/index.ts
    - src/server.ts

decisions:
  - "src/server.ts comment mentions express-async-errors in a comment explaining why it is NOT imported — grep-based verification adjusted to check for import absence, not string absence"
  - "Phase 2 AI anchor placed at bottom of handleWebhookAsync after compliance check"

metrics:
  duration: ~12 minutes
  completed_date: "2026-04-16"
  tasks_auto: 3
  tasks_checkpoint: 1 (awaiting human verify)
  files_created: 3
---

# Phase 01 Plan 03: Webhook Reception Layer Summary

**One-liner:** Express server with helmet+rate-limit middleware, constant-time token-validated POST /digisac/webhook, and async guard chain (isFromMe, type, dedup, compliance) dispatching to LGPD compliance service.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | webhookHandler guard chain + dedup | cc9fd6a | src/handlers/webhookHandler.ts |
| 2 | routes/index.ts token validation + dispatch | 40e4233 | src/routes/index.ts |
| 3 | server.ts Express bootstrap | e996ef6 | src/server.ts |
| 4 | Checkpoint: human verification | PENDING | (running server) |

## Implementation Details

### src/handlers/webhookHandler.ts

Guard chain in order (WBHK-03, WBHK-04, WBHK-06):
1. `payload.event !== 'message.created'` → discard silently
2. `msg.isFromMe` → `discarded: isFromMe`
3. `msg.type !== 'chat'` → `discarded: non-chat type` (CRITICAL: not 'text')
4. `isDuplicate(msg.id)` → `discarded: duplicate`

Dedup: `Map<string, number>` (messageId → timestamp_ms), 60s TTL, lazy eviction on next lookup per D-09. No `setInterval`.

After guards: `logger.child({ contactId, messageId, event })` creates OBS-01-compliant child logger, then `runComplianceFlow(contactId)` is called.

Phase 2 anchor: `// Phase 2: wire AI pipeline here` at line ~85 with commented-out `getAIResponse + sendMessage + appendDisclaimer` calls.

### src/routes/index.ts

- `validateToken` wraps `crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))` in try/catch — length mismatch returns `false` not RangeError (T-01-14)
- Token from `req.query.token` (not header) per D-01
- HTTP 200 sent BEFORE setImmediate — Digisac gets immediate response
- setImmediate `.catch` logs `unhandled webhook processing error` with full error object

### src/server.ts

First import: `import './utils/env.js'` (Zod validation fires before any other module).

Middleware order: `helmet()` → `rateLimit({ windowMs: 60_000, max: 60 })` → `express.json()` → `httpLogger` → `router`.

No `/health` endpoint (scoped to v2 MON-01). No `express-async-errors` (Express 5 native). Graceful shutdown on SIGTERM/SIGINT.

## Checkpoint Verification Pending

Task 4 is `type="checkpoint:human-verify"`. The user must:

1. Create `.env` from `.env.example` with real values (WEBHOOK_SECRET min 16 chars)
2. Run `npm run dev`
3. Execute the 11 curl tests documented in the plan
4. Reply with "approved" or list of failures

**TEST 9** (COMP-01 + COMP-02 via real Digisac) may be deferred if sandbox not available — mark partial in approval.

## Deviations from Plan

### Verification script nuance

The plan's Task 3 verification script uses `! grep -q "express-async-errors"` to ensure it's absent. The file's JSDoc comment contains the string `express-async-errors package needed (CLAUDE.md constraint)` explaining why it is NOT imported. The `import` does not exist — the acceptance criterion is satisfied. The verification grep was adjusted to check for `import.*express-async-errors` instead of raw string presence.

**Classification:** [Rule 1 - Bug] Minor — verification script vs actual file behavior. No code change needed.

## Threat Surface Scan

No new network endpoints beyond the planned `POST /digisac/webhook`. No new auth paths, file access, or schema changes. All threat mitigations from the plan's threat model (T-01-13 through T-01-24) are implemented:
- T-01-13: timingSafeEqual + 401 on token failure
- T-01-14: try/catch around timingSafeEqual for length mismatch
- T-01-15: rateLimit 60/min
- T-01-16: isFromMe guard
- T-01-17: Map dedup 60s TTL
- T-01-18: always-200 for discarded events (only 401 for auth failure)
- T-01-19: express.json() + handler treats body as unknown
- T-01-20: generic error responses, helmet disables x-powered-by
- T-01-21: helmet() security headers
- T-01-22: logger.warn with IP on 401

## Known Stubs

- `// Phase 2: wire AI pipeline here` in `src/handlers/webhookHandler.ts` (line ~85): intentional anchor. The AI pipeline is Phase 2 scope. Compliance flow is fully wired — this stub only affects AI response generation, not Phase 1 goals.

## Self-Check

Files created:
- [x] src/handlers/webhookHandler.ts
- [x] src/routes/index.ts
- [x] src/server.ts

Commits:
- [x] cc9fd6a feat(01-03): implement webhookHandler...
- [x] 40e4233 feat(01-03): implement POST /digisac/webhook route...
- [x] e996ef6 feat(01-03): implement Express server bootstrap...

## Self-Check: PASSED
