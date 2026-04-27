# Codebase Structure

**Analysis Date:** 2026-04-20

## Directory Layout

```
botLP/
├── src/                        # All application source code
│   ├── server.ts               # Entry point — Express app bootstrap
│   ├── handlers/
│   │   └── webhookHandler.ts   # Guard chain + message routing logic
│   ├── routes/
│   │   └── index.ts            # Express router — POST /digisac/webhook
│   ├── services/
│   │   ├── aiService.ts        # OpenAI chat completions + mutex + TTL
│   │   ├── complianceService.ts # OAB/LGPD flow + appendDisclaimer
│   │   ├── digisacService.ts   # Digisac API wrapper (outbound messages)
│   │   ├── handoffService.ts   # Pause state + disk persistence
│   │   └── sessionService.ts   # In-memory session store (history + consent)
│   ├── types/
│   │   └── digisac.ts          # SDK type re-exports (WebhookPayload, IncomingMessage)
│   └── utils/
│       ├── env.ts              # Zod env validation — MUST be first import in server.ts
│       └── logger.ts           # pino singleton + pino-http export
├── docs/
│   ├── ADVERSARIAL-TESTS.md    # UAT adversarial test cases
│   ├── COMPLIANCE-TEXTS.md     # Compliance text guidelines
│   └── GO-LIVE-CHECKLIST.md    # Production go-live gate checklist
├── .planning/
│   ├── codebase/               # Codebase map documents (this directory)
│   ├── phases/                 # Phase planning artifacts (01–04)
│   ├── quick/                  # Quick fix planning artifacts
│   └── research/               # Research documents
├── data/                       # Runtime data — gitignored (LGPD)
│   └── paused.json             # Persisted handoff pause state (created at runtime)
├── .env                        # Local secrets — gitignored, never commit
├── .env.example                # Documents all required env vars (no real values)
├── .gitignore
├── CLAUDE.md                   # Project instructions for Claude
├── DIGISAC_IA_INTEGRATION.md   # Digisac integration reference document
├── README.md                   # Project overview
├── package.json
├── package-lock.json
├── railway.json                # Railway deployment config
└── tsconfig.json
```

## Directory Purposes

**`src/handlers/`:**
- Purpose: Business logic orchestration — the layer that coordinates services
- Contains: `webhookHandler.ts` — guard chain (8 filters), compliance flow invocation, AI pipeline, handoff detection
- Key files: `src/handlers/webhookHandler.ts`

**`src/routes/`:**
- Purpose: Express route definitions — HTTP boundary only
- Contains: `index.ts` — token validation, `200` response, `setImmediate` dispatch
- Key files: `src/routes/index.ts`

**`src/services/`:**
- Purpose: Encapsulated domain logic and external API clients
- Contains: one file per concern; each owns its singleton state and exports pure functions
- Key files: all five `.ts` files in this directory

**`src/types/`:**
- Purpose: Shared type definitions and SDK type facades
- Contains: `digisac.ts` — re-exports SDK types; isolates SDK import paths
- Key files: `src/types/digisac.ts`

**`src/utils/`:**
- Purpose: Cross-cutting infrastructure — logging and env validation
- Contains: `env.ts`, `logger.ts`
- Key files: `src/utils/env.ts` (must be first import), `src/utils/logger.ts`

**`docs/`:**
- Purpose: Human-readable operational documents for the law firm
- Contains: compliance text guidelines, adversarial UAT tests, go-live checklist
- Generated: No — hand-authored
- Committed: Yes

**`data/`:**
- Purpose: Runtime state persistence (`paused.json` for handoff state)
- Generated: Yes — created at runtime by `handoffService.ts`
- Committed: No — gitignored (contains contactIds, LGPD-protected)

**`.planning/`:**
- Purpose: GSD workflow artifacts — phase plans, codebase maps, research
- Generated: Yes — managed by GSD commands
- Committed: Yes

## Key File Locations

**Entry Points:**
- `src/server.ts`: Express app start, middleware chain, graceful shutdown
- `src/routes/index.ts`: `POST /digisac/webhook` route definition

**Configuration:**
- `src/utils/env.ts`: Zod schema, `env` export — all env var access goes through this
- `.env.example`: canonical list of all required and optional env vars
- `tsconfig.json`: TypeScript settings (NodeNext modules, strict mode)
- `railway.json`: production start command and health check config

**Core Logic:**
- `src/handlers/webhookHandler.ts`: main processing pipeline
- `src/services/aiService.ts`: OpenAI integration + conversation state
- `src/services/handoffService.ts`: human handoff + disk persistence

**Type Definitions:**
- `src/types/digisac.ts`: all Digisac webhook types

## Naming Conventions

**Files:**
- camelCase for all `.ts` source files: `webhookHandler.ts`, `aiService.ts`, `sessionService.ts`
- Each file name reflects its primary export or responsibility

**Directories:**
- Plural lowercase: `handlers/`, `routes/`, `services/`, `types/`, `utils/`

**Exports:**
- Named exports for functions and types
- No default exports except `src/routes/index.ts` (Express Router convention)

**Test helpers:**
- `__resetXxxForTesting()` naming convention for test-only state-reset functions (present in `sessionService.ts`, `handoffService.ts`, `complianceService.ts`, `aiService.ts`)

## Where to Add New Code

**New webhook event type:**
- Add guard/handling in: `src/handlers/webhookHandler.ts`
- Add types to: `src/types/digisac.ts`

**New external API integration:**
- Create: `src/services/<name>Service.ts`
- Add env vars to: `src/utils/env.ts` (Zod schema) and `.env.example`

**New Express route:**
- Add to: `src/routes/index.ts`

**New env var:**
- Add to Zod schema in `src/utils/env.ts`
- Document in `.env.example` with a comment

**New shared utility:**
- Add to: `src/utils/<name>.ts`

**New type definition:**
- Add to: `src/types/digisac.ts` (if Digisac-related) or a new `src/types/<name>.ts`

## Special Directories

**`data/`:**
- Purpose: Runtime JSON state files (`paused.json`)
- Generated: Yes (by `handoffService.ts` on first `pause()` call)
- Committed: No — gitignored (LGPD compliance: contains contactIds)
- Production note: must be a Railway persistent volume mount; set `PAUSED_STATE_FILE=/data/paused.json`

**`.planning/codebase/`:**
- Purpose: Codebase map documents read by GSD planning and execution commands
- Generated: Yes — by `/gsd-map-codebase`
- Committed: Yes

---

*Structure analysis: 2026-04-20*
