---
phase: 01-webhook-infrastructure-compliance-foundation
plan: "02"
subsystem: services
tags: [compliance, lgpd, oab, digisac-sdk, services]
depends_on: ["01"]
provides_to: ["03"]

dependency_graph:
  requires:
    - src/utils/env.ts (env.DIGISAC_API_URL, env.DIGISAC_API_TOKEN, env.DIGISAC_SERVICE_ID, env.DISCLOSURE_MESSAGE, env.LGPD_CONSENT_MESSAGE, env.LEGAL_DISCLAIMER)
    - src/utils/logger.ts (logger)
    - "@ikatec/digisac-api-sdk" (BaseApiClient runtime, plan 03 reference)
    - "@ikatec/digisac-api-sdk/apis" (MessagesApi runtime, plan 03 reference)
  provides:
    - src/services/digisacService.ts — sendMessage(contactId, text): Promise<void>
    - src/services/complianceService.ts — runComplianceFlow(contactId): Promise<boolean>, appendDisclaimer(text): string
  affects:
    - src/handlers/webhookHandler.ts (plan 03 imports runComplianceFlow)
    - Future AI response paths must pipe output through appendDisclaimer (COMP-03)

tech_stack:
  added: []
  patterns:
    - require() shim for SDK NodeNext-incompatible type declarations (same pattern as plan 01-01 IncomingMessage derivation)
    - Module-level singleton API client (never per-call instantiation)
    - In-memory Map<string, ComplianceState> for per-contact state (D-07)

key_files:
  created:
    - src/services/digisacService.ts
    - src/services/complianceService.ts
  modified: []

decisions:
  - "require() shim used for BaseApiClient and MessagesApi: SDK dist/.d.ts files use extensionless relative imports incompatible with NodeNext resolution; same root cause as plan 01-01 IncomingMessage deviation"
  - "appendDisclaimer is code-level (COMP-03): format is D-04 byte-exact — backtick template `${text}\\n\\n---\\n⚠️ ${env.LEGAL_DISCLAIMER}`"
  - "__resetComplianceStoreForTesting exported: pragmatic seam for plan 03 verification without module reload"
  - "Errors from sendMessage propagate up: no silent swallow in compliance or digisac service layers"

metrics:
  duration_minutes: 8
  completed_date: "2026-04-16"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 01 Plan 02: Services Layer (Digisac + Compliance) Summary

Thin Digisac SDK wrapper with mandatory `origin: 'bot'` and in-memory LGPD/OAB compliance state machine with code-level disclaimer enforcement.

## What Was Built

### src/services/digisacService.ts

Wraps `@ikatec/digisac-api-sdk` `MessagesApi.create()` in a single exported function `sendMessage(contactId, text)`. Every outbound message carries `origin: 'bot'` — this is the loop-prevention mechanism (T-01-07): when Digisac echoes back bot-sent messages as webhooks they have `isFromMe === true`, which the plan 03 guard discards.

**SDK import paths confirmed at runtime:**
- Main package: `require('@ikatec/digisac-api-sdk')` → `{ BaseApiClient, ApiError, BaseCrudApi }`
- APIs subpath: `require('@ikatec/digisac-api-sdk/apis')` → `{ MessagesApi, ... }` (30+ API classes)

**`MessagesApi.create()` payload fields (confirmed from dist types):**
```typescript
{
  contactId: string;   // Digisac contact UUID
  text: string;        // message body
  serviceId: string;   // Digisac service/channel ID
  origin: 'bot' | 'user';  // MANDATORY — use 'bot' for all automated sends
}
```

### src/services/complianceService.ts

Implements the per-contactId compliance state machine with three states:

| State | disclosureSent | consentGiven | runComplianceFlow returns |
|-------|---------------|--------------|--------------------------|
| New contact | false | false | false (sends 2 messages, sets disclosureSent=true) |
| Awaiting consent | true | false | true (sets consentGiven=true, implicit D-05) |
| Compliant | true | true | true (no messages sent) |

**Byte-exact D-04 disclaimer format produced by `appendDisclaimer`:**
```
${text}

---
⚠️ ${env.LEGAL_DISCLAIMER}
```
(Two newlines before `---`, one newline after, warning emoji prefix on LEGAL_DISCLAIMER)

**In-memory state and restart behavior (D-07):**
State lives in a module-level `Map<string, ComplianceState>`. On server restart, all state is lost — returning leads see the disclosure + consent prompt again. This is documented as acceptable v1 UX. Phase 3 will introduce restart-safe handoff state only (not full compliance state).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] SDK NodeNext type incompatibility — same as plan 01-01**

- **Found during:** Task 1 verification (`tsc --noEmit` returned TS2305)
- **Issue:** `import { BaseApiClient } from '@ikatec/digisac-api-sdk'` fails because `dist/index.d.ts` exports `export * from './core'` without file extension, which TypeScript NodeNext resolution cannot follow. This is identical to the `Message` type incompatibility documented in plan 01-01.
- **Fix:** Replaced `import` with `require()` using explicit interface annotations for `IBaseApiClient` and `IMessagesApi`. Runtime behavior is identical — `require()` CJS loads the same module as `import`. TypeScript is satisfied by the locally-declared interfaces.
- **Files modified:** `src/services/digisacService.ts`
- **Commit:** `decc25a`

## SDK Import Path Reference (for plan 03 + Phase 2)

| What | Import path | How loaded |
|------|-------------|------------|
| BaseApiClient | `@ikatec/digisac-api-sdk` | `require()` with IBaseApiClient interface |
| MessagesApi | `@ikatec/digisac-api-sdk/apis` | `require()` with IMessagesApi interface |
| WebhookPayload | `@ikatec/digisac-api-sdk/incommingWebhooks` | `import type` (types-only, works under NodeNext) |

## Threat Flags

None. Both files stay within the trust boundary established by plan 01-01. No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `src/services/digisacService.ts`: FOUND
- `src/services/complianceService.ts`: FOUND
- Commit `decc25a` (digisacService): FOUND
- Commit `ce0d261` (complianceService): FOUND
- `tsc --noEmit`: passes (exit 0)
- `origin: 'bot'` in digisacService: confirmed
- D-04 format in appendDisclaimer: confirmed (line 80 of complianceService.ts)
- No axios/node-fetch actual imports in src/: confirmed
