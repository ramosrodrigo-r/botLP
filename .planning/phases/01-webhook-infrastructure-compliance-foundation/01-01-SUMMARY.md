---
phase: 01-webhook-infrastructure-compliance-foundation
plan: "01"
subsystem: bootstrap
tags: [typescript, express, zod, pino, bootstrap, env-validation, esm]
dependency_graph:
  requires: []
  provides:
    - src/utils/env.ts (Zod env validation, typed env export)
    - src/utils/logger.ts (pino singleton + pino-http middleware)
    - src/types/digisac.ts (WebhookPayload, MessageCreatedPayload, IncomingMessage type aliases)
    - src/services/aiService.ts (Phase 2 stub signature)
    - package.json (full dependency manifest)
    - tsconfig.json (NodeNext ESM TypeScript config)
    - .gitignore (.env excluded from version control)
    - .env.example (versioned template with D-03 compliance placeholders)
  affects: []
tech_stack:
  added:
    - express@5.2.1
    - "@anthropic-ai/sdk@0.90.0"
    - "@ikatec/digisac-api-sdk@2.1.1"
    - pino@10.3.1
    - pino-http@11.0.0
    - express-rate-limit@8.3.2
    - helmet@8.1.0
    - dotenv@17.4.2
    - zod@4.3.6
    - typescript@5.9.3
    - tsx@4.19.3
    - pino-pretty@13.0.0
  patterns:
    - Zod safeParse for env validation at module load (OBS-02 fail-fast)
    - pino singleton with NODE_ENV-conditional transport
    - NodeNext ESM with .js extension on relative imports
    - SDK type re-export centralization in src/types/
key_files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - .gitignore
    - .env.example
    - src/utils/env.ts
    - src/utils/logger.ts
    - src/types/digisac.ts
    - src/services/aiService.ts
  modified: []
decisions:
  - "NodeNext module resolution requires .js extensions on all relative TypeScript imports"
  - "Message type cannot be re-exported from @ikatec/digisac-api-sdk due to SDK dist files using extensionless relative imports incompatible with NodeNext — derived IncomingMessage from WebhookPayload<'message.created'>['data'] instead"
  - "pinoHttp named import (not default) required for NodeNext CJS interop — pino-http exports named pinoHttp in its type definitions"
metrics:
  duration: "8 minutes"
  completed: "2026-04-16"
  tasks_completed: 3
  tasks_total: 3
  files_created: 9
  files_modified: 0
requirements: [OBS-02]
---

# Phase 01 Plan 01: Bootstrap TypeScript Scaffold Summary

TypeScript ESM project bootstrapped with NodeNext module resolution, Zod env validation at startup (OBS-02 fail-fast), pino structured logging with pino-http middleware, Digisac SDK type re-exports, and Phase 2 AI service stub — all compiling clean with `npx tsc --noEmit`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Initialize package.json, tsconfig.json, .gitignore | 2b9087d | package.json, tsconfig.json, .gitignore, package-lock.json |
| 2 | Create env validation + .env.example template | 43643e9 | src/utils/env.ts, .env.example |
| 3 | Create logger, types re-exports, AI stub | 4a2a1d4 | src/utils/logger.ts, src/types/digisac.ts, src/services/aiService.ts |

## Installed Dependencies

### Production
| Package | Version |
|---------|---------|
| express | 5.2.1 |
| @anthropic-ai/sdk | 0.90.0 |
| @ikatec/digisac-api-sdk | 2.1.1 |
| pino | 10.3.1 |
| pino-http | 11.0.0 |
| express-rate-limit | 8.3.2 |
| helmet | 8.1.0 |
| dotenv | 17.4.2 |
| zod | 4.3.6 |

### Dev
| Package | Version |
|---------|---------|
| typescript | 5.9.3 |
| tsx | 4.19.3 |
| @types/node | 20.19.1 |
| @types/express | 5.0.2 |
| pino-pretty | 13.0.0 |

## Env Schema (12 Fields)

| Field | Validator | Default |
|-------|-----------|---------|
| DIGISAC_API_URL | z.string().url() | — |
| DIGISAC_API_TOKEN | z.string().min(1) | — |
| DIGISAC_SERVICE_ID | z.string().min(1) | — |
| WEBHOOK_SECRET | z.string().min(16) | — |
| ANTHROPIC_API_KEY | z.string().startsWith('sk-ant-') | — |
| CLAUDE_MODEL | z.string() | claude-sonnet-4-6 |
| DISCLOSURE_MESSAGE | z.string().min(1) | — |
| LGPD_CONSENT_MESSAGE | z.string().min(1) | — |
| LEGAL_DISCLAIMER | z.string().min(1) | — |
| SYSTEM_PROMPT | z.string().min(1) | — |
| PORT | z.coerce.number() | 3000 |
| NODE_ENV | z.enum(['development','production','test']) | development |

## TypeScript Compilation

`npx tsc --noEmit` output: **clean, zero errors**.

## Developer Notes

- `.env.example` is versioned with D-03 OAB/LGPD placeholder compliance texts. Developer must create a local `.env` file before running the server. `.env` is excluded from git via `.gitignore`.
- Before Plan 03 (integration testing), a real `.env` with valid Digisac credentials must be created locally.
- OAB/LGPD compliance texts in `.env.example` are placeholders — require stakeholder review before any production lead traffic (documented blocker in STATE.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `pinoHttp` not callable via default import with NodeNext module resolution**
- **Found during:** Task 3
- **Issue:** `import pinoHttp from 'pino-http'` with NodeNext + `esModuleInterop: true` yields `typeof import('pino-http')` (the whole module namespace) rather than the default export. TypeScript reports `This expression is not callable` on `pinoHttp({ logger })`.
- **Fix:** Changed to named import: `import { pinoHttp } from 'pino-http'`. pino-http's `index.d.ts` exports both `export default PinoHttp` and `export { PinoHttp as pinoHttp }` — the named export works correctly with NodeNext resolution.
- **Files modified:** `src/utils/logger.ts`
- **Commit:** 4a2a1d4

**2. [Rule 1 - Bug] `Message` type cannot be imported from `@ikatec/digisac-api-sdk`**
- **Found during:** Task 3
- **Issue:** The plan specified `export type { Message } from '@ikatec/digisac-api-sdk'`. The main SDK entry (`dist/index.d.ts`) only exports core types (BaseApiClient etc.) and does not include `Message`. The `@ikatec/digisac-api-sdk/apis` sub-path resolves to `dist/apis/index.d.ts`, but TypeScript NodeNext cannot traverse the relative imports within that file (`export * from './messages'` → `./MessagesApi` and `./types`) because the SDK's `.d.ts` files use extensionless relative imports which NodeNext requires to have explicit `.js` extensions. The resolution fails silently with `skipLibCheck: true`.
- **Fix:** Removed the direct `Message` re-export. Added `IncomingMessage` type derived as `WebhookPayload<'message.created'>['data']`, which is functionally equivalent (`Omit<Message, MessageRelationships>`) and provides all flat fields handlers need (id, type, text, isFromMe, contactId). Added explanatory comment documenting the SDK limitation.
- **Files modified:** `src/types/digisac.ts`
- **Commit:** 4a2a1d4

**Impact:** Downstream plans (02, 03) that import `Message` from `src/types/digisac.ts` should use `IncomingMessage` instead. The plan's interface spec listed `Message` but `IncomingMessage` provides the same shape. This deviation must be noted for Phase 2 implementers.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `getAIResponse` returns `''` | `src/services/aiService.ts` | Phase 2 stub — intentional per plan. Phase 2 wires Claude API calls. |

## Threat Surface Scan

No new security surface introduced beyond what the threat model covers. All T-01-01 through T-01-05 mitigations are in place:
- `.gitignore` excludes `.env` (T-01-01)
- Zod schema with `process.exit(1)` on failure (T-01-02)
- `WEBHOOK_SECRET` enforced `min(16)` (T-01-03)
- No compliance texts or API keys passed to logger in this plan (T-01-04)
- `z.string().startsWith('sk-ant-')` on ANTHROPIC_API_KEY (T-01-05)
