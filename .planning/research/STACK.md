# Technology Stack

**Project:** botLP — WhatsApp AI Bot for Law Firm
**Researched:** 2026-04-16
**Confidence:** HIGH (all key packages verified via npm registry, Context7, and direct package inspection)

---

## Recommendation: TypeScript

Use TypeScript. The decision deserves a direct answer before the table.

The `@ikatec/digisac-api-sdk` is a TypeScript-first package that ships `.d.ts` type definitions and a `WebhookPayload<E>` generic that narrows `data` to the correct type per event (e.g. `WebhookPayload<'message.created'>` gives you a fully-typed `Message` with `isFromMe`, `text`, `contactId`). Using plain JavaScript means throwing away the one tool that makes Digisac webhook handling safe and self-documenting. The project is not large, but it handles WhatsApp messages for real clients — types prevent the wrong `contactId` from being passed to the wrong function. The compilation cost at this scale is zero in practice (`tsx` runs TypeScript directly with no separate build step needed for local dev and Railway).

**NOT because it's trendy. Because the Digisac SDK is TypeScript-native and the correctness gain is material for a bot handling client data.**

---

## Recommended Stack

### Runtime & Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 20 LTS | Runtime | Specified in PROJECT.md; LTS, native fetch, good `crypto` support for HMAC |
| TypeScript | ^5.5 | Language | Type safety, Digisac SDK types, refactoring safety |
| tsx | ^4.19 | TS runner (dev) | Run `.ts` files directly without tsc/nodemon setup; used as `node --import tsx/esm` |
| Express | ^5.2.1 | HTTP server | Industry standard, minimal, well-understood middleware ecosystem |

**Confidence: HIGH** — Express 5.x went stable in 2024; npm shows 5.2.1 as latest. tsx is the standard no-config TypeScript runner for Node.js projects as of 2025.

### Digisac Integration

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @ikatec/digisac-api-sdk | ^2.1.1 | Digisac REST API client + webhook types | Only production-quality TypeScript SDK for Digisac; ships `WebhookPayload<E>`, `MessagesApi.create()`, `ContactsApi`, typed `CreateMessagePayload`. Published 2026-03-14, actively maintained by ikatec team. |

**Confidence: HIGH** — Package inspected directly from npm registry. Ships CJS + ESM + full `.d.ts` map files. The `incommingWebhooks` export provides `WebhookPayload<'message.created'>` which narrows `data` to `Omit<Message, MessageRelationships>` including `isFromMe: boolean`, `text: string`, `contactId` (via `contact` relation). The `MessagesApi` covers `create()` with `CreateMessagePayload` (`contactId`, `text`, `serviceId`, `origin: 'bot'`).

**Do NOT use:** The Ruby gem `douglara/digisac` (Ruby, not Node.js), bare `axios` calls to Digisac (works but you lose typing, have to hand-write all request shapes, and miss future API changes).

### OpenAI

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| openai | ^4.98.0 | OpenAI API | Official SDK; `client.chat.completions.create()` accepts `messages: [{role, content}][]` directly — maps 1:1 to the in-memory history array pattern |

**Confidence: HIGH** — Verified via npm registry. The SDK handles retries, timeout, streaming, and type-narrows all response shapes. Version 4.98.0 confirmed on npm.

The model ID for this project is `gpt-4o` (per PROJECT.md). Pass it as `model: 'gpt-4o'` — the SDK does not validate model strings, it forwards whatever you pass.

**Do NOT use:** `axios` direct calls to `api.openai.com` — no benefit over the official SDK, and you lose retry logic, type safety, and streaming support.

### Rate Limiting

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| express-rate-limit | ^8.3.2 | Webhook endpoint protection | Standard Express middleware, zero dependencies, in-process store is fine for single-instance deployment. No Redis needed at law firm message volumes. |

**Confidence: HIGH** — npm confirms 8.3.2. For a single-process single-instance bot (Railway, VPS), in-memory store is correct. Do NOT add Redis/rate-limit-redis for v1 — it adds operational complexity with no benefit at this scale.

### Logging

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| pino | ^10.3.1 | Structured JSON logging | Fastest Node.js logger; JSON output ready for Railway's log viewer and any future log aggregator; async I/O so it doesn't block the event loop |
| pino-http | ^11.0.0 | Express request logging middleware | Wraps pino, auto-logs method, URL, status, response time per request; `req.log` child logger available in handlers |
| pino-pretty | ^13.x | Dev-only pretty printer | Human-readable in terminal; use only in development via `NODE_ENV=development` |

**Confidence: HIGH** — All three are the canonical pino stack as of 2025. pino-http 11.0.0 confirmed on npm.

**Do NOT use:** Winston — slower, heavier, no structural advantage over pino for this use case. `console.log` — not structured, not filterable, not queryable in production.

### Environment & Validation

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| dotenv | ^17.4.2 | Load `.env` into `process.env` | Standard; use `dotenv/config` import at entry point |
| zod | ^4.3.6 | Env var validation at startup | Validates that all required env vars are present and correctly typed before the server starts; fails fast with a clear error message instead of cryptic `undefined` crashes later |

**Confidence: HIGH** — Versions confirmed on npm. Zod v4 is production-stable as of 2025.

**Do NOT use:** `@sinclair/typebox` or hand-rolled validation for env — zod is the ecosystem standard and the team already knows it.

### Security

| What | How | Library |
|------|-----|---------|
| Webhook token validation | Compare `Authorization` header (or query param `token`) against `WEBHOOK_SECRET` env var using `crypto.timingSafeEqual` | Node.js built-in `crypto` — no extra package needed |
| Body parsing security | Keep raw body for signature validation before JSON parsing | Express built-in `express.json()` with `verify` callback |
| HTTP security headers | Helmet middleware | `helmet` ^8.1.0 |

**Confidence: HIGH** — Digisac sends a configurable token with each webhook (confirmed via Go package field analysis and community integration examples). The token is compared as a static secret, not HMAC-signed — use `crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))` to prevent timing attacks. No `crypto-js` or other package needed.

**Do NOT use:** `express-validator` for webhook payload validation — Zod handles it more ergonomically with better TypeScript integration.

---

## Supporting Libraries (Optional but Recommended)

| Library | Version | Purpose | When to Add |
|---------|---------|---------|-------------|
| express-async-errors | ^3.1.1 | Forward async errors to Express error handler | Add immediately — without it, unhandled promise rejections in async route handlers crash the process silently in Express 4; not needed in Express 5 (which handles async natively) |
| uuid | ^13.0.0 | Generate correlation IDs for log tracing | Add if you want request-scoped log correlation; optional but useful for debugging |

**Note on express-async-errors:** Express 5 handles async errors natively via `asyncLocalStorage`-based error propagation. Since the stack uses Express 5.x (`^5.2.1`), this package is **not needed**. Include it only if you downgrade to Express 4 for any reason.

---

## What NOT to Use

| Package | Reason |
|---------|--------|
| `axios` | The Digisac SDK uses native `fetch` internally; mixing axios adds a second HTTP client for no benefit. Node.js 20 has native `fetch`. |
| `node-fetch` | Node.js 20 has native `fetch`. Redundant. |
| Redis / ioredis | In-memory Map is the stated architecture for v1. Do not introduce Redis until multi-instance deployment is needed. |
| `bull` / `bullmq` | Queue infrastructure for a single law firm's message volume is over-engineering. PROJECT.md explicitly out-scopes it. |
| `typeorm` / `prisma` | No database in v1. Do not add. |
| `socket.io` | Not needed. Digisac is the delivery layer. |
| `nodemon` | Use `tsx --watch` instead — handles TypeScript without a separate compilation step. |
| Winston | Slower than pino, no structural advantage for this use case. |
| `morgan` | Superseded by `pino-http` once you're using pino. |
| `express-validator` | Use Zod for type-safe validation. |

---

## Conversation History Pattern

The in-memory pattern maps cleanly to the OpenAI SDK's message array shape:

```typescript
// types.ts
import type OpenAI from 'openai'

type ConversationHistory = Map<
  string,                                              // contactId
  OpenAI.Chat.ChatCompletionMessageParam[]             // [{role: 'user'|'assistant', content: string}]
>

const history: ConversationHistory = new Map()
```

**Key decisions:**
- Use `OpenAI.Chat.ChatCompletionMessageParam[]` directly — no custom type needed, it's already exported by the SDK.
- Cap history length: trim to the last N turns before each API call to control token costs. Recommended: last 20 messages (10 exchanges). Implemented as a slice, not a ring buffer, at this scale.
- Never persist to disk. On restart, history resets — acceptable for v1 per PROJECT.md.
- Key is `contactId` (string UUID from Digisac's `data.contactId` on the webhook payload).

---

## Human Handoff Pattern

```typescript
const pausedContacts = new Set<string>()  // contactIds where bot is paused

// Pause: add to set, send handoff message to contact, alert human agent
// Resume: remove from set (manual or via future API endpoint)
// Check: if (pausedContacts.has(contactId)) return early, do not call OpenAI
```

A `Set<string>` is the correct data structure — O(1) lookup, no dependencies. Do not use a database or Redis for this in v1.

---

## Installation

```bash
# Initialize project with TypeScript
npm init -y
npm install express openai @ikatec/digisac-api-sdk \
  pino pino-http express-rate-limit helmet dotenv zod

npm install -D typescript tsx @types/node @types/express \
  pino-pretty
```

```json
// package.json scripts
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --import tsx/esm src/index.ts",
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit"
  }
}
```

```json
// tsconfig.json (minimal, Node.js 20)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Confidence: HIGH** — tsx v4 supports `--watch` and `--import tsx/esm` patterns for Node.js 20. No separate `tsc --watch` process needed.

---

## Exact Versions Summary

| Package | Version | Type |
|---------|---------|------|
| express | ^5.2.1 | prod |
| openai | ^4.98.0 | prod |
| @ikatec/digisac-api-sdk | ^2.1.1 | prod |
| pino | ^10.3.1 | prod |
| pino-http | ^11.0.0 | prod |
| express-rate-limit | ^8.3.2 | prod |
| helmet | ^8.1.0 | prod |
| dotenv | ^17.4.2 | prod |
| zod | ^4.3.6 | prod |
| typescript | ^5.5 | dev |
| tsx | ^4.19 | dev |
| @types/node | ^20 | dev |
| @types/express | ^5 | dev |
| pino-pretty | ^13.x | dev |

---

## Sources

- OpenAI TypeScript SDK: npm registry + Context7 `/openai/openai-node` (HIGH confidence)
- `@ikatec/digisac-api-sdk`: Direct npm registry inspection + package source extraction, version 2.1.1 (HIGH confidence)
- Digisac webhook payload structure: `pkg.go.dev/github.com/pericles-luz/go-base/pkg/digisac` (MEDIUM confidence — Go implementation mirrors JS payload; confirmed against SDK types)
- express-rate-limit: `npmjs.com/package/express-rate-limit` v8.3.2, MDN Blog (HIGH confidence)
- pino + pino-http: BetterStack guide, SigNoz 2026 guide, npm registry (HIGH confidence)
- Webhook HMAC/token validation: hookdeck.com, GitHub webhook docs pattern (HIGH confidence for pattern; Digisac-specific token mechanism is MEDIUM — documented behavior inferred from community integrations)
- TypeScript vs JavaScript tradeoff: DEV Community, tech-insider.org 2026 survey (MEDIUM confidence — editorial judgment applied)
