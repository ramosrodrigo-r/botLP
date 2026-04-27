# Architecture

**Analysis Date:** 2026-04-20

## Pattern Overview

**Overall:** Single-process event-driven pipeline with in-memory state and fire-and-forget async processing.

**Key Characteristics:**
- Webhook-driven: all work begins from a Digisac `POST /digisac/webhook` call
- Immediate HTTP response: `200 OK` is returned before any async processing starts (`setImmediate` decoupling)
- Guard chain pattern: a sequence of ordered filter checks in `webhookHandler.ts` that silently discard unprocessable messages before any service is invoked
- Stateless services: all state lives in module-level singleton Maps; services export pure functions
- No database, no queue, no external cache — in-memory Map for sessions, file-backed Map for handoff state

## Layers

**HTTP Layer:**
- Purpose: Accept inbound webhooks, authenticate, and dispatch to async processing
- Location: `src/server.ts`, `src/routes/index.ts`
- Contains: Express app setup, middleware chain, webhook route, health check
- Depends on: `src/utils/env.ts`, `src/utils/logger.ts`, `src/handlers/webhookHandler.ts`
- Used by: Digisac platform (outbound webhook delivery)

**Handler Layer:**
- Purpose: Business logic orchestration — guard chain, compliance flow, AI pipeline, handoff detection
- Location: `src/handlers/webhookHandler.ts`
- Contains: Guard chain (8 guards), urgency keyword detection, dedup map, message routing
- Depends on: all services (`aiService`, `complianceService`, `digisacService`, `sessionService`, `handoffService`), `env`, `logger`
- Used by: routes layer (via `setImmediate` fire-and-forget)

**Service Layer:**
- Purpose: Encapsulate external API calls and domain state
- Location: `src/services/`
- Contains: five focused service modules (see Key Abstractions below)
- Depends on: `env`, `logger`; services may call each other (e.g., `aiService` calls `digisacService` for fallback sends)
- Used by: handler layer

**Utility Layer:**
- Purpose: Cross-cutting concerns — env validation, logging
- Location: `src/utils/`
- Contains: `env.ts` (Zod schema + `env` export), `logger.ts` (pino singleton + pino-http export)
- Depends on: nothing (bootstraps first; `env.ts` must be the first import in `server.ts`)
- Used by: all layers

**Type Layer:**
- Purpose: Shared type definitions and SDK type re-exports
- Location: `src/types/digisac.ts`
- Contains: `WebhookPayload`, `MessageCreatedPayload`, `IncomingMessage` (derived from SDK)
- Pattern: thin re-export facade — all code imports from `src/types/digisac.ts`, not directly from the SDK

## Data Flow

**Inbound Message → AI Reply:**

1. Digisac delivers `POST /digisac/webhook?token=<secret>` with JSON body
2. `routes/index.ts`: validates token (`crypto.timingSafeEqual`), returns `200 { received: true }` immediately
3. `setImmediate` schedules `handleWebhookAsync(req.body)` — HTTP response already sent
4. Guard chain in `webhookHandler.ts` filters: sandbox, event type, `isFromMe`, message type, dedup, empty text, paused contact, urgency keywords
5. `complianceService.runComplianceFlow()` — sends disclosure/LGPD messages if first interaction; returns `false` to halt until user replies (implicit consent)
6. `aiService.getAIResponse()` — acquires per-contact mutex, checks session TTL, calls OpenAI with system prompt + trimmed history (last 20 messages)
7. On `[HANDOFF]` marker in AI reply: `handoffService.pause()` + `digisacService.sendMessage(HANDOFF_MESSAGE)`
8. Normal path: `complianceService.appendDisclaimer(aiReply)` + `digisacService.sendMessage()`

**Urgency Fast Path:**

1. Guard 7 detects urgency keyword in message text
2. `handoffService.pause(contactId, 'urgency')` — persists to disk atomically
3. `digisacService.sendMessage(HANDOFF_MESSAGE)` — no disclaimer, no AI call

**State Management:**
- Conversation history: `SessionState.history` (type `OpenAI.Chat.ChatCompletionMessageParam[]`) in `sessionService.ts`
- Per-contact history is updated only after successful OpenAI response (no contamination on error)
- Session TTL: 24h idle → `aiService.ts` resets session atomically (history + consent flags)
- Paused state: `handoffService.ts` maintains in-memory Map backed by `data/paused.json`; loaded at startup before `app.listen()`

## Key Abstractions

**`SessionState` (interface):**
- Purpose: Unified per-contact state — conversation history, LGPD consent flags, TTL timestamp
- Location: `src/services/sessionService.ts`
- Fields: `history`, `consentGiven`, `disclosureSent`, `lastAccessAt`
- Pattern: returned by reference from `getOrCreateSession()` — mutations persist without a second `set()` call

**`aiService`:**
- Purpose: OpenAI pipeline with mutex, TTL, and rate-limit fallback
- Location: `src/services/aiService.ts`
- Pattern: per-contact `Mutex` map (lazy init, lazy delete) serializes concurrent messages for the same contact; history committed to session only on success
- Error type: `FallbackAlreadySent` — sentinel class thrown after 429 to prevent double-send

**`digisacService`:**
- Purpose: Outbound message delivery via Digisac API
- Location: `src/services/digisacService.ts`
- Pattern: module-level singletons (`BaseApiClient`, `MessagesApi`); SDK loaded via `createRequire` ESM workaround due to SDK `.d.ts` import path issues
- Constraint: every outbound call sets `origin: 'bot'` — mandatory to prevent bot loops

**`handoffService`:**
- Purpose: Pause state (human handoff) with disk persistence
- Location: `src/services/handoffService.ts`
- Pattern: synchronous `isPaused()` O(1) lookup; async `pause()` writes atomically to disk (tmp file + rename); `loadFromDisk()` awaited before `app.listen()`

**`complianceService`:**
- Purpose: OAB disclosure + LGPD consent flow; legal disclaimer append
- Location: `src/services/complianceService.ts`
- Pattern: stateless — reads/writes via `sessionService`; `appendDisclaimer()` is a pure function that MUST wrap every AI reply before delivery

## Entry Points

**`src/server.ts`:**
- Location: `src/server.ts`
- Triggers: process start (`node --import tsx/esm src/server.ts`)
- Responsibilities: import `env.ts` first (Zod validation), configure Express middleware chain, await `handoffService.loadFromDisk()`, bind to `0.0.0.0:PORT`

**`POST /digisac/webhook`:**
- Location: `src/routes/index.ts`
- Triggers: Digisac webhook delivery
- Responsibilities: token auth, immediate `200` response, `setImmediate` dispatch to `handleWebhookAsync`

**`GET /health`:**
- Location: `src/server.ts` (inline route, registered before rate-limit middleware)
- Triggers: Railway health check poller
- Responsibilities: returns `{ status: 'ok', uptime: <seconds> }`

## Error Handling

**Strategy:** Errors propagate up to the `setImmediate` top-level `.catch()` in `routes/index.ts`, which logs via `logger.error`. HTTP 200 is already sent so errors never reach the client.

**Patterns:**
- `FallbackAlreadySent` — sentinel error class in `aiService.ts`; caught in `webhookHandler.ts` to prevent double-delivery of fallback message
- OpenAI `RateLimitError` — caught in `aiService.ts`; sends `OPENAI_FALLBACK_MESSAGE`, then throws `FallbackAlreadySent`
- All other errors — rethrown and caught by the top-level `.catch()` in the route handler
- `loadFromDisk` ENOENT / JSON parse errors — caught and logged (warn/info); server starts with empty pause state rather than crashing
- Env validation failure — `process.exit(1)` with formatted Zod error output (fail-fast)

## Cross-Cutting Concerns

**Logging:**
- Root logger: `src/utils/logger.ts` pino singleton
- Request logging: pino-http `httpLogger` middleware
- Handler logging: `logger.child({ contactId, messageId })` — never mutate root logger
- Service logging: `logger.child({ contactId, service: '<name>' })`

**Validation:**
- Env vars: Zod schema in `src/utils/env.ts` — validated once at module load, fail-fast
- Webhook auth: `crypto.timingSafeEqual` token check — constant-time, length-safe
- Message filtering: guard chain in `webhookHandler.ts` — ordered, synchronous checks before any I/O

**Authentication:**
- Webhook: query param token validated against `WEBHOOK_SECRET` env var
- Digisac API: `DIGISAC_API_TOKEN` passed to `BaseApiClient`
- OpenAI: `OPENAI_API_KEY` passed to `new OpenAI()`

---

*Architecture analysis: 2026-04-20*
