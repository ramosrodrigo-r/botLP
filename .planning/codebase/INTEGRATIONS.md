# External Integrations

**Analysis Date:** 2026-04-20

## APIs & External Services

**Messaging Platform:**
- Digisac (WhatsApp) — receives inbound messages via webhook; sends outbound replies
  - SDK/Client: `@ikatec/digisac-api-sdk` v2.1.1 (loaded via `createRequire` ESM workaround)
  - API base URL: `DIGISAC_API_URL` (e.g. `https://api.sac.digital/v1`)
  - Auth: `DIGISAC_API_TOKEN` (env var), `DIGISAC_SERVICE_ID` (env var)
  - Webhook auth: `WEBHOOK_SECRET` (query param `?token=`, validated with `crypto.timingSafeEqual`)
  - Webhook URL requires HTTPS — no HTTP support
  - Client instantiation: `src/services/digisacService.ts` — module-level singletons `BaseApiClient` + `MessagesApi`

**AI Provider:**
- OpenAI — chat completions for lead qualification conversation
  - SDK: `openai` v4.98.0 — `client.chat.completions.create()`
  - Auth: `OPENAI_API_KEY` (must start with `sk-`)
  - Model: `OPENAI_MODEL` (default `gpt-4o`)
  - Client instantiation: `src/services/aiService.ts` — module-level singleton `new OpenAI()`
  - Rate limit handling: `OpenAI.RateLimitError` caught → sends `OPENAI_FALLBACK_MESSAGE` → throws `FallbackAlreadySent`

## Data Storage

**Databases:**
- None — in-memory only for v1

**In-Memory State:**
- Session store: `Map<string, SessionState>` in `src/services/sessionService.ts`
  - Keyed by `contactId` (UUID string from Digisac)
  - Holds: OpenAI conversation history, LGPD consent flags, `lastAccessAt` timestamp
  - 24h TTL (lazy check in `aiService.ts`)
  - Cleared on process restart (acceptable v1 behavior)
- Paused contacts: `Map<string, PauseRecord>` in `src/services/handoffService.ts`
  - Keyed by `contactId`
  - Backed by disk file for restart durability (see File Storage below)
- Dedup map: `Map<string, number>` in `src/handlers/webhookHandler.ts`
  - 60s TTL, lazy eviction, no setInterval

**File Storage:**
- `data/paused.json` — persists paused contact IDs across restarts
  - Path configurable via `PAUSED_STATE_FILE` env var (default `./data/paused.json`)
  - Production: Railway persistent volume mounted at `/data`, set `PAUSED_STATE_FILE=/data/paused.json`
  - Written atomically: `writeFile(tmp)` + `rename(target)` (POSIX atomic on ext4)
  - `data/` directory is gitignored (contactIds are LGPD-protected personal data)

**Caching:**
- None — no Redis, no external cache

## Authentication & Identity

**Webhook Auth:**
- Token-based: Digisac sends `?token=<WEBHOOK_SECRET>` as query parameter
- Validated with Node.js `crypto.timingSafeEqual` — constant-time comparison prevents timing attacks
- Implementation: `src/routes/index.ts` `validateToken()` function

**Outbound Identity:**
- Every outbound message sets `origin: 'bot'` on the Digisac API call
- This causes Digisac to mark the resulting webhook as `isFromMe: true`, which the guard chain discards to prevent infinite loops

## Monitoring & Observability

**Logging:**
- pino (structured JSON) + pino-http (per-request logging)
- Production: JSON output to Railway's log viewer
- Development: pino-pretty transport for human-readable terminal output
- Log level: `info` in production, `debug` in development
- Context propagation: `logger.child({ contactId, messageId })` pattern — never mutate root logger

**Error Tracking:**
- None — errors are logged via pino and surface in Railway logs

**Health Check:**
- `GET /health` → `{ status: 'ok', uptime: <seconds> }`
- Registered before rate-limit middleware (prevents Railway health poller from hitting 429)

## CI/CD & Deployment

**Hosting:**
- Railway (PaaS) — Linux container
- Config: `railway.json` at project root

**CI Pipeline:**
- None — no automated CI configured

## Webhooks & Callbacks

**Incoming:**
- `POST /digisac/webhook?token=<WEBHOOK_SECRET>` — receives all Digisac events
  - Response: `200 { received: true }` (immediately, before async processing)
  - Only `message.created` events are processed; all others are silently discarded
  - Processing is fire-and-forget via `setImmediate()` to keep HTTP round-trip under Digisac's timeout

**Outgoing:**
- None — all outbound communication is via Digisac API calls from `src/services/digisacService.ts`

## Environment Configuration

**Required env vars (server fails to start if missing):**
- `DIGISAC_API_URL` — Digisac REST API base URL (must be a valid URL)
- `DIGISAC_API_TOKEN` — Digisac authentication token
- `DIGISAC_SERVICE_ID` — Digisac service identifier
- `WEBHOOK_SECRET` — Webhook token (min 16 characters)
- `OPENAI_API_KEY` — OpenAI API key (must start with `sk-`)
- `DISCLOSURE_MESSAGE` — OAB compliance disclosure text
- `LGPD_CONSENT_MESSAGE` — LGPD consent prompt text
- `LEGAL_DISCLAIMER` — Legal disclaimer appended to every AI reply
- `SYSTEM_PROMPT` — OpenAI system prompt defining bot behavior

**Optional env vars (have defaults):**
- `OPENAI_MODEL` — default `gpt-4o`
- `OPENAI_FALLBACK_MESSAGE` — default Portuguese fallback text
- `URGENCY_KEYWORDS` — CSV list, default `preso,liminar,audiência amanhã,habeas corpus,flagrante`
- `HANDOFF_MESSAGE` — default Portuguese handoff notification
- `PAUSED_STATE_FILE` — default `./data/paused.json`
- `SANDBOX_MODE` — default `false`; when `true`, only contactIds in `SANDBOX_NUMBERS` are served
- `SANDBOX_NUMBERS` — CSV list of allowed contactIds in sandbox mode
- `PORT` — default `3000`
- `NODE_ENV` — default `development`

**Secrets location:**
- Local: `.env` file (gitignored)
- Production: Railway environment variable dashboard

---

*Integration audit: 2026-04-20*
