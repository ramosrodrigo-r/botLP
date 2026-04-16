# Phase 1: Webhook Infrastructure + Compliance Foundation - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 10 new files (greenfield project)
**Analogs found:** 0 / 10 (no existing src/ codebase — all patterns sourced from RESEARCH.md verified excerpts and DIGISAC_IA_INTEGRATION.md)

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/server.ts` | config/entry-point | request-response | RESEARCH.md Pattern (server.ts example) | doc-pattern only |
| `src/routes/index.ts` | route | request-response | RESEARCH.md Pattern 1 (immediate 200 + fire-and-forget) | doc-pattern only |
| `src/handlers/webhookHandler.ts` | middleware/handler | event-driven | RESEARCH.md Pattern 3 (guard chain) | doc-pattern only |
| `src/services/digisacService.ts` | service | request-response | RESEARCH.md Pattern 6 (SDK MessagesApi) | doc-pattern only |
| `src/services/complianceService.ts` | service | event-driven | RESEARCH.md Pattern 7 (compliance state machine) | doc-pattern only |
| `src/services/aiService.ts` | service | request-response | RESEARCH.md (stub only for Phase 2) | doc-pattern only |
| `src/utils/env.ts` | utility | transform | RESEARCH.md Pattern 5 (Zod env validation) | doc-pattern only |
| `src/utils/logger.ts` | utility | transform | RESEARCH.md Pattern 8 (pino singleton) | doc-pattern only |
| `src/types/digisac.ts` | type/config | — | RESEARCH.md (SDK re-export guidance) | doc-pattern only |
| `.env.example` | config | — | RESEARCH.md Code Example (.env.example) | doc-pattern only |

> **Note:** This is a greenfield project. The only files at the repo root are `CLAUDE.md` and `DIGISAC_IA_INTEGRATION.md`. No `src/` directory exists. All patterns below are sourced from RESEARCH.md (which contains SDK-verified excerpts) and supersede the `DIGISAC_IA_INTEGRATION.md` where they conflict (e.g., `type === 'chat'` not `'text'`; SDK not axios; query param not header for token).

---

## Pattern Assignments

### `src/server.ts` (config/entry-point, request-response)

**Source:** RESEARCH.md — "server.ts entry point" code example

**Imports pattern:**
```typescript
import './utils/env'; // must be first — validates env before anything else
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { httpLogger, logger } from './utils/logger';
import { env } from './utils/env';
import router from './routes/index';
```

**Middleware order pattern (Claude's Discretion — documented choice):**
```typescript
const app = express();

app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 60 }));
app.use(express.json());
app.use(httpLogger);

app.use('/', router);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started');
});
```

**Key rules:**
- `import './utils/env'` must be the very first import — env validation fires at module load, before any other module accesses `process.env`
- Middleware order: `helmet` → `rateLimit` → `express.json()` → `httpLogger` → routes
- No `express-async-errors` — Express 5 handles async errors natively
- Rate limiting is applied globally here (not per-route) to cover all future endpoints

---

### `src/routes/index.ts` (route, request-response)

**Source:** RESEARCH.md Pattern 1 (Immediate 200 + Fire-and-Forget) + Pattern 2 (Token Validation)

**Imports pattern:**
```typescript
import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { env } from '../utils/env';
import { logger } from '../utils/logger';
import { handleWebhookAsync } from '../handlers/webhookHandler';
```

**Token validation pattern** (RESEARCH.md Pattern 2):
```typescript
function validateToken(incoming: string | undefined, expected: string): boolean {
  if (!incoming) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(incoming),
      Buffer.from(expected)
    );
  } catch {
    // Buffer length mismatch throws — treat as invalid
    // Prevents attacker from inferring token length via error vs. non-error
    return false;
  }
}
```

**Core route pattern** (RESEARCH.md Pattern 1):
```typescript
const router = Router();

router.post('/digisac/webhook', (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;

  if (!validateToken(token, env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately — Digisac has a short webhook timeout
  res.status(200).json({ received: true });

  // Fire-and-forget: decouple HTTP response from async processing
  setImmediate(() => {
    handleWebhookAsync(req.body).catch(err =>
      logger.error({ err }, 'unhandled webhook error')
    );
  });
});

export default router;
```

**Key rules:**
- Token is from `req.query.token` (query param), NOT a header — per D-01
- 401 is the ONLY non-200 status this route returns (security rejection, not event discard)
- `res.status(200)` is sent BEFORE `setImmediate` — never after any async work
- `setImmediate` is preferred over `process.nextTick` to yield to I/O between the response and processing

---

### `src/handlers/webhookHandler.ts` (handler, event-driven)

**Source:** RESEARCH.md Pattern 3 (Webhook Guard Chain) + Pattern 4 (Deduplication Map)

**Imports pattern:**
```typescript
import type { WebhookPayload } from '@ikatec/digisac-api-sdk/incommingWebhooks';
import { logger } from '../utils/logger';
import { runComplianceFlow } from '../services/complianceService';
```

**Deduplication pattern** (RESEARCH.md Pattern 4):
```typescript
const seenMessages = new Map<string, number>(); // messageId → timestamp ms
const DEDUP_TTL_MS = 60_000;

function isDuplicate(messageId: string): boolean {
  const seenAt = seenMessages.get(messageId);
  if (seenAt === undefined) return false;
  if (Date.now() - seenAt > DEDUP_TTL_MS) {
    seenMessages.delete(messageId); // lazy eviction
    return false;
  }
  return true;
}

function recordSeen(messageId: string): void {
  seenMessages.set(messageId, Date.now());
}
```

**Guard chain pattern** (RESEARCH.md Pattern 3):
```typescript
export async function handleWebhookAsync(body: unknown): Promise<void> {
  const payload = body as WebhookPayload;

  // Guard 1: event type filter
  if (payload.event !== 'message.created') {
    logger.debug({ event: payload.event }, 'discarded: non-message event');
    return;
  }

  const msg = payload.data;

  // Guard 2: outbound message filter (bot's own messages)
  if (msg.isFromMe) {
    logger.debug({ messageId: msg.id }, 'discarded: isFromMe');
    return;
  }

  // Guard 3: non-text message type filter
  // CRITICAL: Digisac uses type === 'chat' for text, NOT 'text'
  // Verified in @ikatec/digisac-api-sdk v2.1.1 MessageType union
  if (msg.type !== 'chat') {
    logger.debug({ messageId: msg.id, type: msg.type }, 'discarded: non-chat type');
    return;
  }

  // Guard 4: deduplication
  if (isDuplicate(msg.id)) {
    logger.debug({ messageId: msg.id }, 'discarded: duplicate');
    return;
  }
  recordSeen(msg.id);

  // All guards passed — run compliance flow
  const contactId = msg.contactId;
  const log = logger.child({ contactId, messageId: msg.id });
  log.info('processing message');

  await runComplianceFlow(contactId);
  // Phase 2: wire AI pipeline after compliance check returns true
}
```

**Key rules:**
- Guards return silently — never throw, never produce non-200 responses (HTTP 200 already sent)
- Guard order is fixed: event type → isFromMe → message type → dedup → compliance
- `msg.type === 'chat'` is the correct check — NOT `'text'` (common pitfall documented in RESEARCH.md Pitfall 1)
- Dedup uses lazy eviction (no setInterval) per D-09
- `logger.child({ contactId })` creates a bound child logger for all subsequent log calls per OBS-01

---

### `src/services/digisacService.ts` (service, request-response)

**Source:** RESEARCH.md Pattern 6 (Digisac Service via SDK)

**Imports pattern:**
```typescript
import { BaseApiClient } from '@ikatec/digisac-api-sdk';
import { MessagesApi } from '@ikatec/digisac-api-sdk/apis';
import { env } from '../utils/env';
```

**Core service pattern:**
```typescript
const apiClient = new BaseApiClient(env.DIGISAC_API_URL, env.DIGISAC_API_TOKEN);
const messagesApi = new MessagesApi(apiClient);

export async function sendMessage(contactId: string, text: string): Promise<void> {
  await messagesApi.create({
    contactId,
    text,
    serviceId: env.DIGISAC_SERVICE_ID,
    origin: 'bot',  // marks message as bot-sent; prevents agent confusion
  });
}
```

**Key rules:**
- Use `@ikatec/digisac-api-sdk` `MessagesApi.create()` — never `axios`, never raw `fetch`
- `origin: 'bot'` is mandatory on every outbound message to prevent bot-sends-to-itself loop (per CLAUDE.md constraint)
- Module-level singleton client — do not instantiate per-call
- `sendMessage` throws on API error — callers must handle (see complianceService)

---

### `src/services/complianceService.ts` (service, event-driven)

**Source:** RESEARCH.md Pattern 7 (Compliance Service)

**Imports pattern:**
```typescript
import { env } from '../utils/env';
import { sendMessage } from './digisacService';
import { logger } from '../utils/logger';
```

**State and flow pattern:**
```typescript
interface ComplianceState {
  disclosureSent: boolean;
  consentGiven: boolean;
}

const complianceStore = new Map<string, ComplianceState>();

function getState(contactId: string): ComplianceState {
  if (!complianceStore.has(contactId)) {
    complianceStore.set(contactId, { disclosureSent: false, consentGiven: false });
  }
  return complianceStore.get(contactId)!;
}

/**
 * Returns true if message should proceed to AI processing.
 * Returns false if we sent disclosure/consent and are waiting for next response.
 *
 * NOTE: State is in-memory. Server restart clears all state.
 * Returning leads will see disclosure again — acceptable for v1 per D-07.
 */
export async function runComplianceFlow(contactId: string): Promise<boolean> {
  const state = getState(contactId);

  if (!state.disclosureSent) {
    await sendMessage(contactId, env.DISCLOSURE_MESSAGE);
    await sendMessage(contactId, env.LGPD_CONSENT_MESSAGE);
    state.disclosureSent = true;
    // consentGiven stays false — next message = implicit consent per D-05
    return false;
  }

  if (!state.consentGiven) {
    // D-06: any subsequent message = implicit consent; proceed
    state.consentGiven = true;
    return true;
  }

  return true; // both done — proceed to AI pipeline
}

/**
 * Appends the legal disclaimer to any AI-generated response text.
 * MUST be called in code for every response — never rely on system prompt alone.
 * Per D-04 and CLAUDE.md constraint.
 */
export function appendDisclaimer(text: string): string {
  return `${text}\n\n---\n⚠️ ${env.LEGAL_DISCLAIMER}`;
}
```

**Key rules:**
- `runComplianceFlow` is called on EVERY message after guards pass — unconditionally
- `appendDisclaimer` must be called on every string sent to leads that contains AI-generated content
- Never bypass this service to send messages directly — route all outbound text through here or through explicit `sendMessage` calls that include `appendDisclaimer` downstream
- Consent is implicit (any reply) per D-05 — do not require keyword matching

---

### `src/services/aiService.ts` (service stub, request-response)

**Source:** RESEARCH.md architecture diagram (Phase 2 placeholder)

**Pattern:** Minimal stub that exports the function signature Phase 2 will implement.

```typescript
// Phase 2 stub — wired into webhookHandler after compliance flow passes
// Do not implement AI logic here in Phase 1
import { logger } from '../utils/logger';

/**
 * Placeholder for Phase 2 AI pipeline.
 * Phase 1: logs a debug message and returns empty string.
 * Phase 2: calls openai client.chat.completions.create() with conversation history.
 */
export async function getAIResponse(
  contactId: string,
  userMessage: string
): Promise<string> {
  logger.debug({ contactId }, 'aiService.getAIResponse called (Phase 2 stub)');
  return '';
}
```

**Key rules:**
- Keep stub minimal — the signature is what matters for Phase 2 wiring
- `OPENAI_API_KEY` and `OPENAI_MODEL` are validated in env.ts even in Phase 1 (fail-fast on missing credentials before production)

---

### `src/utils/env.ts` (utility, transform)

**Source:** RESEARCH.md Pattern 5 (Zod Env Validation) + "Complete env.ts" code example

**Full pattern** (copy directly):
```typescript
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  // Digisac
  DIGISAC_API_URL:      z.string().url(),
  DIGISAC_API_TOKEN:    z.string().min(1),
  DIGISAC_SERVICE_ID:   z.string().min(1),
  WEBHOOK_SECRET:       z.string().min(16),   // enforce minimum entropy

  // OpenAI (validated now even though AI pipeline is Phase 2)
  OPENAI_API_KEY:       z.string().startsWith('sk-'),
  OPENAI_MODEL:         z.string().default('gpt-4o'),

  // Compliance texts (from D-02) — placeholder values in .env.example
  DISCLOSURE_MESSAGE:   z.string().min(1),
  LGPD_CONSENT_MESSAGE: z.string().min(1),
  LEGAL_DISCLAIMER:     z.string().min(1),
  SYSTEM_PROMPT:        z.string().min(1),

  // Server
  PORT:                 z.coerce.number().default(3000),
  NODE_ENV:             z.enum(['development', 'production', 'test']).default('development'),
});

const result = EnvSchema.safeParse(process.env);
if (!result.success) {
  console.error('FATAL: Invalid environment configuration:');
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
```

**Key rules:**
- `import 'dotenv/config'` is at the top of THIS file — not in server.ts
- This module must be the first import in `server.ts` so env is validated before any other module runs
- Use `process.exit(1)` — not `throw` — so the error message is clean (not a stack trace)
- `WEBHOOK_SECRET` has `.min(16)` to enforce minimum entropy (RESEARCH.md Pattern 5 note)
- Export both `env` (value) and `Env` (type) for typed access throughout the codebase

---

### `src/utils/logger.ts` (utility, transform)

**Source:** RESEARCH.md Pattern 8 (pino Logger Setup)

**Full pattern:**
```typescript
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty' },
  }),
});

export const httpLogger = pinoHttp({ logger });
```

**Child logger usage pattern** (OBS-01 requirement):
```typescript
// In handlers/services, create a child logger with context:
const log = logger.child({ contactId, messageId });
log.info('processing message');
log.error({ err }, 'compliance flow failed');
```

**Key rules:**
- Module-level singleton — do not instantiate per-request
- `pino-pretty` transport only in non-production — JSON output in production for Railway log viewer
- `httpLogger` (pino-http) is used as Express middleware in server.ts, not logger directly
- For per-request context, use `logger.child({ contactId, ... })` — never mutate the root logger

---

### `src/types/digisac.ts` (type, no data flow)

**Source:** RESEARCH.md — SDK re-export guidance + Pattern 3 type imports

**Pattern:** Re-export and narrow SDK types for use throughout the project.

```typescript
// Re-export SDK webhook types — use these throughout the project
// Do NOT hand-roll these; the SDK ships typed WebhookPayload<E> that narrows data correctly
export type { WebhookPayload } from '@ikatec/digisac-api-sdk/incommingWebhooks';
export type { Message } from '@ikatec/digisac-api-sdk';

// Convenience type alias for the specific event we handle
import type { WebhookPayload } from '@ikatec/digisac-api-sdk/incommingWebhooks';
export type MessageCreatedPayload = WebhookPayload<'message.created'>;
```

**Key rules:**
- Never duplicate what the SDK already types (isFromMe, type: MessageType, contactId, text, id)
- `MessageType` union from SDK includes `'chat' | 'audio' | 'ptt' | 'video' | 'image' | 'document' | ...` — there is no `'text'` value
- If SDK import paths change between versions, fix here only — all code imports from `../types/digisac`

---

### `.env.example` (config template)

**Source:** RESEARCH.md "Complete .env.example" code example

**Full template:**
```env
# Digisac
DIGISAC_API_URL=https://api.sac.digital/v1
DIGISAC_API_TOKEN=
DIGISAC_SERVICE_ID=

# Webhook security (min 16 characters recommended)
WEBHOOK_SECRET=

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# Compliance texts (PLACEHOLDERS — review with escritório before any real lead traffic)
# Based on OAB Provimento 205/2021 and LGPD (Lei 13.709/2018)
DISCLOSURE_MESSAGE=Olá! Sou um assistente virtual do escritório de advocacia. Sou uma inteligência artificial e não sou um advogado. Este atendimento é informativo.
LGPD_CONSENT_MESSAGE=Para continuar, precisamos do seu consentimento para processar seus dados conforme a LGPD (Lei 13.709/2018). Ao responder, você concorda com o uso dos seus dados para fins de atendimento. Continue com sua mensagem para prosseguir.
LEGAL_DISCLAIMER=Este atendimento é meramente informativo e não constitui aconselhamento jurídico. Consulte um advogado para orientação específica sobre seu caso.
SYSTEM_PROMPT=Você é um assistente de atendimento de um escritório de advocacia. Você NUNCA deve dar opiniões jurídicas definitivas, interpretar legislação específica, ou afirmar o que o cliente tem ou não direito de fazer. Use linguagem meramente informativa. Quando não souber uma resposta, diga explicitamente e oriente o cliente a aguardar um atendimento humano. Nunca prometa resultados ou prazos.

# Server
PORT=3000
NODE_ENV=development
```

**Key rules:**
- All values are empty strings except for safe defaults (PORT, NODE_ENV, OPENAI_MODEL, compliance placeholders)
- Compliance texts are populated with D-03 placeholders — marked clearly as requiring stakeholder review
- `.env` (with real values) is in `.gitignore`; `.env.example` is versioned

---

## Shared Patterns

### Middleware Chain Order
**Apply to:** `src/server.ts`
**Rule:** `helmet()` → `rateLimit()` → `express.json()` → `httpLogger` → routes
**Rationale:** Security headers and rate limiting before body parsing — rejects bad requests before allocating memory for JSON parse. httpLogger after json() so it can log parsed body size.

### Always-200 for Discarded Events
**Apply to:** `src/handlers/webhookHandler.ts` (all guards), `src/routes/index.ts`
**Rule:** HTTP 200 is sent before `setImmediate`. Guard returns in the handler do not produce HTTP responses — HTTP 200 is already sent. Only exception: 401 for token validation failure.
**Source:** RESEARCH.md Pitfall 3 — Digisac retries on non-200, causing message floods.

### Pino Child Logger for Per-Contact Context
**Apply to:** `src/handlers/webhookHandler.ts`, `src/services/complianceService.ts`, `src/services/digisacService.ts`
**Pattern:**
```typescript
const log = logger.child({ contactId, messageId });
log.info('...');
log.error({ err }, '...');
```
**Source:** RESEARCH.md OBS-01 requirement — logs must include `contactId`, `eventType`, `requestId`.

### Error Handling in Async Paths
**Apply to:** All async functions called from `setImmediate` callback
**Pattern:**
```typescript
// In setImmediate callback (routes/index.ts):
handleWebhookAsync(req.body).catch(err =>
  logger.error({ err }, 'unhandled webhook error')
);

// In services (digisacService, complianceService):
// Let errors propagate up to the setImmediate catch handler
// Do NOT swallow errors silently
```
**Source:** RESEARCH.md — Express 5 handles async errors natively in route handlers; setImmediate callbacks are outside Express's error handler scope and must have their own catch.

### Module-Level Singletons
**Apply to:** `src/utils/logger.ts`, `src/services/digisacService.ts`, `src/services/complianceService.ts`, `src/handlers/webhookHandler.ts`
**Rule:** Instantiate Maps, API clients, and pino logger at module load — not per-request. In-memory state (`seenMessages`, `complianceStore`) is module-level.

---

## No Analog Found

All files in this phase are new with no codebase analog (greenfield). All patterns are sourced from RESEARCH.md verified excerpts (HIGH confidence) and DIGISAC_IA_INTEGRATION.md (MEDIUM confidence, with known corrections).

| File | Role | Why No Analog |
|------|------|---------------|
| All 10 files | various | No `src/` directory exists — project is greenfield as of 2026-04-16 |

### Corrections vs. DIGISAC_IA_INTEGRATION.md

The integration guide contains known errors that RESEARCH.md has corrected. Planner and implementer MUST use RESEARCH.md versions, not the integration guide versions:

| Integration Guide Says | Correct Pattern | Source |
|------------------------|----------------|--------|
| `msg.type === 'text'` | `msg.type === 'chat'` | SDK `MessageType` union — no `'text'` value exists |
| `axios.post(...)` for Digisac API | `messagesApi.create(...)` from SDK | CLAUDE.md constraint: never use axios |
| Header `x-digisac-token` for auth | `req.query.token` (query param) | D-01 decision |
| `event === 'message.received'` | `event === 'message.created'` | SDK `WebhookPayload` event union |

---

## Metadata

**Analog search scope:** `/home/rodrigo/botLP/` root (only `CLAUDE.md` and `DIGISAC_IA_INTEGRATION.md` found — no src/ directory)
**Files scanned:** 2 (CLAUDE.md, DIGISAC_IA_INTEGRATION.md) + 2 planning docs (CONTEXT.md, RESEARCH.md)
**Pattern extraction date:** 2026-04-16
**Pattern confidence:** HIGH for all patterns sourced from RESEARCH.md (SDK-verified); MEDIUM for DIGISAC_IA_INTEGRATION.md (known errors corrected above)
