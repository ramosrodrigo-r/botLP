---
phase: 02-conversation-history-ai-pipeline
plan: "01"
subsystem: session-state
tags: [session, compliance, env, foundation]
dependency_graph:
  requires: [phase-01-webhook-infrastructure-compliance-foundation]
  provides: [SessionState, getOrCreateSession, resetSession, isSessionExpired, OPENAI_FALLBACK_MESSAGE]
  affects: [src/services/complianceService.ts, src/services/aiService.ts]
tech_stack:
  added: []
  patterns: [unified-session-map, optional-env-with-default]
key_files:
  created:
    - src/services/sessionService.ts
  modified:
    - src/services/complianceService.ts
    - src/utils/env.ts
    - .env.example
decisions:
  - "SessionState is the single Map entry holding history + compliance flags + lastAccessAt"
  - "complianceService.ts is now stateless — all state delegated to sessionService"
  - "__resetComplianceStoreForTesting kept as backward-compat shim (delegates to __resetSessionStoreForTesting)"
  - "OPENAI_FALLBACK_MESSAGE is optional-with-default following OPENAI_MODEL precedent"
metrics:
  duration: "2 minutes"
  completed_date: "2026-04-17"
  tasks_completed: 3
  files_changed: 4
---

# Phase 02 Plan 01: SessionState Foundation Summary

**One-liner:** Unified per-contact SessionState in sessionService.ts (history + consentGiven + disclosureSent + lastAccessAt) with complianceService.ts refactored to stateless pattern and OPENAI_FALLBACK_MESSAGE added to Zod env schema with Portuguese default.

## Objective Recap

Establish the unified SessionState foundation for Phase 2 by:
1. Creating `sessionService.ts` as the single source of truth for all per-contact state
2. Refactoring `complianceService.ts` to read/write compliance flags via SessionState instead of its own Map
3. Adding `OPENAI_FALLBACK_MESSAGE` to the Zod env schema so Plan 02's 429 handler has a validated default

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create sessionService.ts | d20d749 | src/services/sessionService.ts (created) |
| 2 | Refactor complianceService.ts | 5bda95c | src/services/complianceService.ts |
| 3 | Add OPENAI_FALLBACK_MESSAGE | 25622fd | src/utils/env.ts, .env.example |

## Key Decisions

- **SessionState as unified record:** history, consentGiven, disclosureSent, and lastAccessAt live in one Map entry. When Plan 02 calls `resetSession(contactId)`, all four fields reset atomically (D-04: tudo expira junto).
- **complianceService.ts is now stateless:** removed ComplianceState interface, complianceStore Map, and getState helper. All state reads/writes go through `getOrCreateSession()`.
- **Backward-compat shim:** `__resetComplianceStoreForTesting()` retained but now delegates to `__resetSessionStoreForTesting()`. Existing test code continues to work without modification.
- **No mutex in sessionService.ts:** getOrCreateSession/resetSession are synchronous Map operations — race-free within this file. Async mutex belongs in aiService.ts (Plan 02, T-02-02).
- **OPENAI_FALLBACK_MESSAGE optional-with-default:** follows OPENAI_MODEL pattern in Zod schema; server boots without it set; default is Portuguese user-facing text, not a secret.

## Files Modified

### src/services/sessionService.ts (created)
- Exports: `SessionState` interface, `SESSION_TTL_MS` (86_400_000), `getOrCreateSession`, `resetSession`, `isSessionExpired`, `__resetSessionStoreForTesting`
- Zero imports from other project modules (prevents circular dependencies)
- Only external import: `OpenAI` from `'openai'` (for `ChatCompletionMessageParam` type)

### src/services/complianceService.ts (refactored)
- Removed: `ComplianceState` interface, `complianceStore` Map, `getState` helper
- Added: imports for `getOrCreateSession` and `__resetSessionStoreForTesting` from `./sessionService.js`
- `runComplianceFlow` logic preserved byte-for-byte — reads/writes `session.disclosureSent` and `session.consentGiven` via SessionState reference
- `appendDisclaimer` unchanged (COMP-03 format: `${text}\n\n---\n⚠️ ${env.LEGAL_DISCLAIMER}`)
- `webhookHandler.ts` caller untouched (`runComplianceFlow(contactId)` signature preserved)

### src/utils/env.ts
- Added `OPENAI_FALLBACK_MESSAGE: z.string().default(...)` in OpenAI group (after OPENAI_MODEL)
- Default: `'No momento estou com dificuldades técnicas para responder. Um de nossos atendentes entrará em contato em breve.'`
- All existing vars unchanged (SYSTEM_PROMPT, OPENAI_MODEL, Digisac vars, compliance texts)

### .env.example
- Added two lines after `OPENAI_MODEL=gpt-4o`: comment documenting default + commented-out override line
- Intentionally commented out to avoid Zod receiving an empty string that overrides the default

## Verification Results

- `npx tsc --noEmit` exits 0 across all three tasks
- `grep -c "^export" src/services/sessionService.ts` = 6 (>= 5 required)
- No circular imports in sessionService.ts (only `openai` external import; references to other modules are in comments only)
- Runtime check: loading env.ts without `OPENAI_FALLBACK_MESSAGE` in process.env returns the full Portuguese default string
- `__resetComplianceStoreForTesting` still exported and delegates correctly
- `runComplianceFlow` count in webhookHandler.ts = 3 (import + call + type — untouched)

## Open Questions for Plan 02

1. **lastAccessAt update strategy:** Plan 02 must update `session.lastAccessAt = Date.now()` on each message so TTL is measured from last activity, not session creation. This plan provides the field; Plan 02 owns the update.
2. **Mutex scope:** The async mutex in Plan 02's `getAIResponse` should wrap the entire `isSessionExpired → resetSession → AI call` block to prevent interleaved writes on concurrent messages from the same contact.
3. **History migration:** `aiService.ts` still has its own `histories` Map. Plan 02 will remove it and use `session.history` from `getOrCreateSession(contactId)` instead.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files exist and all commits verified on disk.
