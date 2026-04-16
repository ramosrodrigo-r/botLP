# Phase 1: Webhook Infrastructure + Compliance Foundation — Research

**Researched:** 2026-04-16
**Domain:** Node.js/Express webhook server, Digisac SDK, OAB/LGPD compliance, env validation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Token validado como query param `?token=` na URL do webhook. O Digisac é configurado com a URL `https://seuapp.railway.app/digisac/webhook?token=SEU_SECRET`. Nosso servidor extrai `req.query.token` e compara com `WEBHOOK_SECRET` via `crypto.timingSafeEqual`. Retorna 401 se inválido.

**D-02:** Textos de compliance configurados via env vars (não hardcoded). O escritório ajusta sem re-deploy. Env vars necessárias:
- `DISCLOSURE_MESSAGE` — mensagem de identificação como IA (COMP-01)
- `LGPD_CONSENT_MESSAGE` — termo de consentimento LGPD (COMP-02)
- `LEGAL_DISCLAIMER` — texto appendado a toda resposta da IA (COMP-03)
- `SYSTEM_PROMPT` — instrui a IA a usar linguagem meramente informativa (COMP-04)

**D-03:** Placeholders defensivos são implementados na Fase 1 (baseados no Provimento OAB 205/2021 e LGPD). O escritório revisa e substitui antes do deploy em produção com leads reais.

**D-04:** O disclaimer jurídico é appendado após a resposta da IA, separado por linha em branco + `---`. Formato:
```
[resposta da IA]

---
⚠️ ${LEGAL_DISCLAIMER}
```
O append é feito em código (não apenas no system prompt) para garantir que toda resposta enviada contenha o disclaimer, independente do conteúdo.

**D-05:** Qualquer resposta do lead após o envio do termo de consentimento conta como aceite implícito. Sem exigência de palavra-chave específica.

**D-06:** Se o lead enviar uma pergunta sem ter recebido o termo ainda (edge case de histórico), o bot reenvia o termo uma vez. Se o lead ignorar o termo e enviar outra mensagem, trata como aceite implícito e prossegue.

**D-07:** Estado de consentimento por `contactId` é armazenado em memória junto com o histórico. Na Fase 1, apenas a flag `consentGiven: boolean` é necessária — o histórico completo fica para a Fase 2.

**D-08:** Estrutura modular:
```
src/
  server.ts
  routes/index.ts
  services/digisacService.ts
  services/aiService.ts
  services/complianceService.ts
  handlers/webhookHandler.ts
  utils/logger.ts
  utils/env.ts
  types/digisac.ts
```

**D-09:** Deduplicação via `Map<messageId, timestamp>` em memória. TTL de 60 segundos. IDs expirados são limpos na próxima verificação (lazy eviction).

### Claude's Discretion

- Implementação interna dos middlewares Express (ordem: helmet → rate-limit → json parser → rotas)
- Formato exato dos logs pino (campos além de `contactId`, `eventType`, `requestId`)
- Lazy eviction vs. setInterval para limpeza do cache de dedup

### Deferred Ideas (OUT OF SCOPE)

- Texto final aprovado pelo escritório para COMP-01, COMP-02, COMP-03 — revisão com stakeholder antes do deploy em produção
- SAND-01: Sandbox mode (SANDBOX_MODE env var) — pode ser adicionado na Fase 4 se necessário
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WBHK-01 | Servidor retorna HTTP 200 ao Digisac imediatamente (antes de chamar Claude) para evitar reenvios duplicados | Fire-and-forget pattern: `res.status(200).json({received:true})` then `setImmediate(processAsync)` — verified pattern in ARCHITECTURE.md |
| WBHK-02 | Endpoint valida token de autenticação do Digisac com `crypto.timingSafeEqual` e retorna 401 se inválido | D-01: query param `?token=`; `crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))` — Node.js built-in, no external package |
| WBHK-03 | Sistema ignora mensagens onde `isFromMe === true` | `Message.isFromMe: boolean` confirmed in SDK types. Return 200 silently — never 4xx for intentionally ignored events |
| WBHK-04 | Sistema ignora eventos que não sejam mensagens de texto (áudios, imagens, documentos) | `Message.type: MessageType` = `'chat' \| 'audio' \| 'ptt' \| 'video' \| 'image' \| 'document' \| ...` — text messages have `type === 'chat'`, not `'text'` (SDK-verified critical nuance) |
| WBHK-05 | Rate limiting no endpoint webhook (máximo 60 requisições/minuto por IP) | `express-rate-limit` ^8.3.2: `rateLimit({ windowMs: 60000, max: 60 })` — npm-verified |
| WBHK-06 | Deduplicação de webhooks por ID de mensagem (Digisac pode reenviar em caso de lentidão) | D-09: `Map<messageId, timestamp>` with 60s TTL and lazy eviction |
| COMP-01 | Bot envia mensagem de disclosure na primeira interação de cada contato, identificando-se como IA | `complianceService.ts` checks if `contactId` has received disclosure; sends `DISCLOSURE_MESSAGE` via `digisacService` before any AI reply |
| COMP-02 | Bot apresenta termo de consentimento LGPD e aguarda confirmação antes de iniciar a qualificação | D-05/D-06: `consentGiven: boolean` flag per contactId in memory; any response = implicit consent |
| COMP-03 | Código appenda disclaimer ao final de toda resposta da IA (não apenas no prompt) | D-04: `complianceService.appendDisclaimer(text)` appends `\n\n---\n⚠️ ${LEGAL_DISCLAIMER}` — must be called in code, never omittable |
| COMP-04 | System prompt instrui a IA a usar linguagem meramente informativa (OAB Provimento 205/2021) | `SYSTEM_PROMPT` env var with placeholder text enforcing informative-only language; verified D-02 |
| OBS-01 | Logs estruturados com pino incluindo: contactId, tipo de evento, request-id Anthropic, erros com stack trace | `pino` ^10.3.1 + `pino-http` ^11.0.0; child logger `logger.child({ contactId })` pattern |
| OBS-02 | Variáveis de ambiente validadas na inicialização do servidor (falha rápido se faltarem credenciais) | `zod` ^4.3.6 schema in `utils/env.ts`; `z.object({...}).parse(process.env)` at module load; process.exit(1) on failure |
</phase_requirements>

---

## Summary

Phase 1 builds the entire input layer of the bot: HTTP reception, security, filtering, and compliance scaffolding. It is deliberately not a "simple skeleton" — it wires in legal compliance (OAB disclosure + LGPD consent) from the first message, because retrofitting these after user data is flowing is legally and architecturally dangerous.

The technical surface is well-understood and low-risk. Express 5, the Digisac SDK, and pino are all production-stable. The primary engineering challenge is getting the guard order and compliance flow exactly right, since any bug here (e.g., missing `isFromMe` check, disclaimer not appended in code, consent not tracked per-contact) can cause legal exposure or a message flood.

One critical SDK discovery: Digisac uses `type === 'chat'` for text messages — **not** `type === 'text'` as the integration guide implies. This is verified directly from the SDK type definition (`MessageType = 'chat' | 'audio' | 'ptt' | 'video' | 'image' | 'document' | ...`). Getting this filter wrong means the bot ignores all text messages.

**Primary recommendation:** Build the webhook handler guard chain first (WBHK-02 → WBHK-03 → WBHK-04 → WBHK-06 → WBHK-01), then wire compliance state (COMP-01 → COMP-02), then attach logging and env validation. Every guard returns HTTP 200 for ignored events — never 4xx for intentional discards.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Webhook reception | API / Backend (Express) | — | Digisac POSTs to our HTTP endpoint; client has no role here |
| Token authentication | API / Backend (Express middleware) | — | Must happen at network boundary before any processing |
| Event filtering (isFromMe, type, dedup) | API / Backend (webhookHandler) | — | Guard chain before any async work; HTTP layer concern |
| HTTP 200 immediate response | API / Backend (route handler) | — | Must complete synchronously before any async processing |
| Async message processing dispatch | API / Backend (setImmediate) | — | Fire-and-forget to decouple HTTP response from processing |
| Compliance state (disclosure sent, consent given) | API / Backend (complianceService) | — | Per-contactId in-memory state; no client/DB tier needed in v1 |
| Sending disclosure/consent messages | API / Backend (digisacService) | — | Calls Digisac REST API; no client tier |
| Disclaimer append | API / Backend (complianceService) | — | Code-level guarantee; must not be UI/prompt-only |
| Structured logging | API / Backend (pino) | — | Server-side only; Railway log viewer is the consumer |
| Env var validation | API / Backend (startup) | — | Must happen before server binds to port |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.13.1 (installed) | Runtime | LTS-compatible; native fetch; crypto built-in |
| TypeScript | ^5.5 | Language | SDK is TypeScript-native; type safety for webhook payloads |
| tsx | ^4.19 | TS runner | No tsc build step; `tsx watch src/server.ts` for dev |
| Express | ^5.2.1 | HTTP server | Async error propagation built-in (no express-async-errors needed) |
| @ikatec/digisac-api-sdk | ^2.1.1 | Digisac REST client + webhook types | Only TS SDK for Digisac; ships `WebhookPayload<E>`, `MessagesApi`, `Message` type |
| pino | ^10.3.1 | Structured logging | Fastest Node.js logger; JSON output for Railway |
| pino-http | ^11.0.0 | Request logging middleware | Auto-logs per-request; exposes `req.log` child logger |
| helmet | ^8.1.0 | HTTP security headers | Standard Express hardening |
| express-rate-limit | ^8.3.2 | Rate limiting | In-process; no Redis needed at law firm volume |
| dotenv | ^17.4.2 | Load .env | Standard; import `dotenv/config` at entry point |
| zod | ^4.3.6 | Env var validation | Fails fast with clear errors on startup |

All versions verified via `npm view` on 2026-04-16. [VERIFIED: npm registry]

### Dev

| Library | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.5 | Compiler + type checking |
| tsx | ^4.19 | Direct TS execution |
| @types/node | ^20 | Node.js type definitions |
| @types/express | ^5 | Express 5 type definitions |
| pino-pretty | ^13.x | Human-readable logs in dev |

### What NOT to Use

| Package | Reason |
|---------|--------|
| axios | Digisac SDK uses native fetch; Node.js 20+ has native fetch. Redundant second HTTP client. |
| express-async-errors | Not needed — Express 5 handles async errors natively |
| nodemon | Use `tsx watch` instead |
| Winston / morgan | Superseded by pino + pino-http |

**Installation:**
```bash
npm install express @ikatec/digisac-api-sdk pino pino-http helmet express-rate-limit dotenv zod
npm install -D typescript tsx @types/node @types/express pino-pretty
```

---

## Architecture Patterns

### System Architecture Diagram

```
Digisac Platform
      │
      │ POST /digisac/webhook?token=SECRET
      ▼
┌─────────────────────────────────────────────────────┐
│ Express Server (src/server.ts)                      │
│                                                     │
│ Middleware chain (in order):                        │
│   helmet() → rateLimit() → express.json() → route  │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Route Handler (src/routes/index.ts)             │ │
│ │                                                 │ │
│ │  1. Extract req.query.token                     │ │
│ │  2. timingSafeEqual(token, WEBHOOK_SECRET)      │ │
│ │     └─ FAIL → return 401                        │ │
│ │  3. res.status(200).json({ received: true })    │ │◄── HTTP response here
│ │  4. setImmediate(() => webhookHandler(body))    │ │    BEFORE any async work
│ └──────────────────────┬──────────────────────────┘ │
└─────────────────────────┼───────────────────────────┘
                          │ (async, after HTTP 200 sent)
                          ▼
┌─────────────────────────────────────────────────────┐
│ webhookHandler (src/handlers/webhookHandler.ts)     │
│                                                     │
│  Guard chain (each guard returns early):            │
│  1. event !== 'message.created' → discard + log     │
│  2. isFromMe === true → discard + log               │
│  3. type !== 'chat' → discard + log                 │
│  4. dedup: messageId seen in last 60s → discard     │
│     └─ if new: record messageId with timestamp      │
│                                                     │
│  Passed all guards → call complianceService         │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│ complianceService (src/services/complianceService.ts)│
│                                                     │
│  State per contactId (in-memory Map):               │
│    { disclosureSent: boolean, consentGiven: boolean }│
│                                                     │
│  Flow:                                              │
│  1. disclosureSent? NO → send DISCLOSURE_MESSAGE    │
│                         mark disclosureSent = true  │
│                         send LGPD_CONSENT_MESSAGE   │
│                         return (wait for response)  │
│                                                     │
│  2. consentGiven? NO → re-send consent (once)       │
│                        mark consentGiven = true     │
│                        (implicit accept on reply)   │
│                        continue to AI pipeline      │
│                                                     │
│  3. Both done → return control to handler           │
│     (Phase 2 wires AI pipeline here)                │
│                                                     │
│  appendDisclaimer(text):                            │
│    return `${text}\n\n---\n⚠️ ${LEGAL_DISCLAIMER}`  │
└──────────────────────┬──────────────────────────────┘
                       │ sendMessage(contactId, text)
                       ▼
┌─────────────────────────────────────────────────────┐
│ digisacService (src/services/digisacService.ts)     │
│                                                     │
│  BaseApiClient(DIGISAC_API_URL, DIGISAC_API_TOKEN)  │
│  MessagesApi.create({ text, contactId, serviceId,  │
│                        origin: 'bot' })             │
└─────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── server.ts              # Entry point: dotenv/config, env validation, Express setup, listen
├── routes/
│   └── index.ts           # POST /digisac/webhook route — token check, 200, setImmediate
├── handlers/
│   └── webhookHandler.ts  # Guard chain + dispatches to complianceService
├── services/
│   ├── digisacService.ts  # Wraps MessagesApi from @ikatec/digisac-api-sdk
│   ├── aiService.ts       # Stub for Phase 2 — exports placeholder for wiring
│   └── complianceService.ts # Disclosure/LGPD state + appendDisclaimer
├── utils/
│   ├── logger.ts          # pino instance (with pino-http export for middleware)
│   └── env.ts             # Zod schema, parse, export typed env object
└── types/
    └── digisac.ts         # Re-exports from @ikatec/digisac-api-sdk (WebhookPayload, Message)
.env.example               # Template with all required vars (versioned)
.gitignore                 # .env excluded
tsconfig.json
package.json
```

### Pattern 1: Immediate 200 + Fire-and-Forget

**What:** Return HTTP 200 before any async processing. Hand off to `setImmediate`.
**When to use:** Always — Digisac has a short webhook timeout. Claude calls can take 5-30s.

```typescript
// Source: ARCHITECTURE.md (verified pattern)
app.post('/digisac/webhook', (req: Request, res: Response) => {
  // Token check happens in middleware before this
  res.status(200).json({ received: true });          // instant response to Digisac
  setImmediate(() => {
    handleWebhookAsync(req.body).catch(err =>
      logger.error({ err }, 'unhandled webhook error')
    );
  });
});
```

### Pattern 2: Token Validation with timingSafeEqual

**What:** Compare webhook token from query param against env var secret in constant time.
**When to use:** First check in the route handler before returning 200.

```typescript
// Source: CLAUDE.md + Node.js crypto built-in
import crypto from 'node:crypto';

function validateToken(incoming: string | undefined, expected: string): boolean {
  if (!incoming) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(incoming),
      Buffer.from(expected)
    );
  } catch {
    // Buffer length mismatch throws — treat as invalid
    return false;
  }
}
```

Note: `crypto.timingSafeEqual` throws if buffers are different lengths. The try/catch prevents an attacker from inferring token length via error vs. non-error behavior. [VERIFIED: Node.js docs behavior]

### Pattern 3: Webhook Guard Chain

**What:** Ordered early-return guards. Each guard returns silently (never 4xx for intentional discards).
**When to use:** At the start of `handleWebhookAsync`, after HTTP 200 is already sent.

```typescript
// Source: DIGISAC_IA_INTEGRATION.md + SDK types
import type { WebhookPayload } from '@ikatec/digisac-api-sdk/incommingWebhooks';

async function handleWebhookAsync(body: unknown): Promise<void> {
  const payload = body as WebhookPayload;

  // Guard 1: event type
  if (payload.event !== 'message.created') {
    logger.debug({ event: payload.event }, 'discarded: non-message event');
    return;
  }

  const msg = payload.data; // typed as Omit<Message, MessageRelationships>

  // Guard 2: outbound messages (bot or agent sent)
  if (msg.isFromMe) {
    logger.debug({ messageId: msg.id }, 'discarded: isFromMe');
    return;
  }

  // Guard 3: non-text message types
  // CRITICAL: Digisac text messages use type 'chat', NOT 'text'
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

  // Passed all guards — process
  const contactId = msg.contactId; // direct field on Message
  await processMessage(contactId, msg.text, payload);
}
```

### Pattern 4: Deduplication Map with Lazy TTL Eviction

**What:** `Map<messageId, timestamp>` with 60-second TTL, cleaned on next lookup.
**When to use:** D-09 decision — lazy eviction, no setInterval needed.

```typescript
// Source: CONTEXT.md D-09 decision
const seenMessages = new Map<string, number>(); // messageId → timestamp
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

### Pattern 5: Zod Env Validation at Startup

**What:** Parse `process.env` through a Zod schema. Fail fast with clear error if anything is missing.
**When to use:** In `utils/env.ts`, imported at the top of `server.ts`.

```typescript
// Source: CLAUDE.md + Zod v4 docs [VERIFIED: ctx7 /colinhacks/zod]
import { z } from 'zod';

const EnvSchema = z.object({
  // Digisac
  DIGISAC_API_URL:      z.string().url(),
  DIGISAC_API_TOKEN:    z.string().min(1),
  DIGISAC_SERVICE_ID:   z.string().min(1),
  WEBHOOK_SECRET:       z.string().min(16),   // enforce minimum entropy
  // Anthropic
  ANTHROPIC_API_KEY:    z.string().startsWith('sk-ant-'),
  CLAUDE_MODEL:         z.string().default('claude-sonnet-4-6'),
  // Compliance texts (from D-02)
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
  console.error('FATAL: Missing or invalid environment variables:');
  console.error(result.error.format());
  process.exit(1);
}

export const env = result.data;
```

### Pattern 6: Digisac Service via SDK

**What:** Instantiate `BaseApiClient` and `MessagesApi` from the SDK. Use `origin: 'bot'` to prevent loop.
**When to use:** In `digisacService.ts` for all outbound messages.

```typescript
// Source: @ikatec/digisac-api-sdk v2.1.1 [VERIFIED: npm package inspection]
import { BaseApiClient } from '@ikatec/digisac-api-sdk';
import { MessagesApi } from '@ikatec/digisac-api-sdk/apis';
import { env } from '../utils/env';

const apiClient = new BaseApiClient(env.DIGISAC_API_URL, env.DIGISAC_API_TOKEN);
const messagesApi = new MessagesApi(apiClient);

export async function sendMessage(contactId: string, text: string): Promise<void> {
  await messagesApi.create({
    contactId,
    text,
    serviceId: env.DIGISAC_SERVICE_ID,
    origin: 'bot',  // marks message as bot-sent; helps distinguish from agent messages
  });
}
```

### Pattern 7: Compliance Service

**What:** In-memory per-contact compliance state. Orchestrates disclosure and consent flow.
**When to use:** Called by webhookHandler after all event guards pass.

```typescript
// Source: CONTEXT.md D-05/D-06/D-07
import { env } from '../utils/env';
import { sendMessage } from './digisacService';

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
 * Returns true if the message should proceed to AI processing.
 * Returns false if we sent disclosure/consent and are waiting for response.
 */
export async function runComplianceFlow(contactId: string): Promise<boolean> {
  const state = getState(contactId);

  if (!state.disclosureSent) {
    await sendMessage(contactId, env.DISCLOSURE_MESSAGE);
    await sendMessage(contactId, env.LGPD_CONSENT_MESSAGE);
    state.disclosureSent = true;
    // consentGiven stays false — next message = implicit accept (D-05)
    return false;
  }

  if (!state.consentGiven) {
    // D-06: any subsequent message = implicit consent
    state.consentGiven = true;
    return true; // proceed — this message IS the consent
  }

  return true; // both done, proceed to AI
}

export function appendDisclaimer(text: string): string {
  return `${text}\n\n---\n⚠️ ${env.LEGAL_DISCLAIMER}`;
}
```

### Pattern 8: pino Logger Setup

**What:** Module-level singleton pino instance + pino-http middleware.

```typescript
// Source: pino docs / pino-http docs [VERIFIED: npm registry]
// utils/logger.ts
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

### Anti-Patterns to Avoid

- **Awaiting Claude inside the HTTP handler:** Causes timeout on Digisac's end, triggers duplicate delivery. Always return 200 first.
- **Returning 4xx for `isFromMe` or non-text events:** Digisac retries on non-200. Always return 200 + discard silently.
- **Using `type === 'text'` to filter text messages:** Digisac text messages have `type === 'chat'`. This filter would discard all text messages. Verified in SDK types.
- **Disclaimer only in system prompt:** Claude can and will omit it. Must be code-level append in `complianceService.appendDisclaimer()`.
- **Missing try/catch in timingSafeEqual:** Throws when buffer lengths differ. Attacker can infer token length. Always wrap in try/catch and return false on error.
- **`WEBHOOK_SECRET` not validated at startup:** If undefined, `Buffer.from(undefined)` throws at runtime on first request. Zod schema must mark it required.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Digisac REST API calls | Custom fetch wrapper | `@ikatec/digisac-api-sdk` `MessagesApi` | Handles auth, types, error shapes |
| Webhook payload typing | Manual interfaces | `WebhookPayload<'message.created'>` from SDK | Narrows `data` to typed `Message`; `isFromMe`, `type`, `text` all typed |
| HTTP security headers | Custom middleware | `helmet` | 15+ headers in one call; OWASP defaults |
| Rate limiting | IP counter in memory | `express-rate-limit` | Handles edge cases (trust proxy, reset, headers) |
| Env var presence checks | `if (!process.env.X) throw` | `zod` schema parse | Single schema, typed output, clear error messages |
| Constant-time comparison | `===` string comparison | `crypto.timingSafeEqual` | Timing attack prevention |

**Key insight:** The SDK's type system is the primary reason not to hand-roll Digisac calls. `Omit<Message, MessageRelationships>` gives you exactly the flat fields available on incoming webhook data — TypeScript will catch access to relation fields that aren't present.

---

## Common Pitfalls

### Pitfall 1: Wrong message type filter (`'text'` vs `'chat'`)

**What goes wrong:** Filtering `msg.type === 'text'` discards ALL text messages because Digisac uses `type === 'chat'` for standard text messages.

**Why it happens:** The `DIGISAC_IA_INTEGRATION.md` reference document says "Verificar que `type === 'text'`" — this is incorrect. The SDK `MessageType` union is `'chat' | 'audio' | 'ptt' | 'video' | 'image' | 'document' | 'vcard' | 'location' | 'email' | 'sticker' | 'comment' | 'ticket' | 'summary' | 'reaction' | 'hsm' | 'bot_action' | string`. There is no `'text'` value.

**How to avoid:** Always use `msg.type === 'chat'` to detect text messages. Log the raw `type` field during initial development to confirm.

**Warning signs:** Server receives webhooks (logs show token validation passing) but zero messages are ever processed.

[VERIFIED: @ikatec/digisac-api-sdk v2.1.1 types.d.ts]

---

### Pitfall 2: `crypto.timingSafeEqual` throws on length mismatch

**What goes wrong:** If the incoming token length differs from the expected secret length, `crypto.timingSafeEqual` throws a `RangeError: Input Buffers must have the same byte length`. Unhandled, this crashes the request handler.

**Why it happens:** The function requires equal-length buffers — it's designed to prevent length-based timing attacks. An attacker sending a 1-character token will trigger this.

**How to avoid:** Wrap in try/catch; return false on any error.

**Warning signs:** 500 errors on webhook endpoint from requests with short tokens.

[VERIFIED: Node.js crypto docs behavior]

---

### Pitfall 3: Digisac retries when server returns non-200 for ignored events

**What goes wrong:** Returning `res.status(400)` or other 4xx for `isFromMe` events causes Digisac to retry delivery. The retry loops until Digisac gives up, flooding the server with duplicate events.

**Why it happens:** Digisac interprets any non-200 as "delivery failed, should retry."

**How to avoid:** Always return 200 for events you intentionally discard. Only return 401 for token validation failure (which is a security rejection, not an event filter).

**Warning signs:** Log shows same webhook event delivered 3+ times in quick succession.

[CITED: DIGISAC_IA_INTEGRATION.md section 11 + ARCHITECTURE.md error handling section]

---

### Pitfall 4: complianceService state not consulted on every message

**What goes wrong:** If the compliance check is bypassed (e.g., only runs on "first" message by checking Map size), a contact who messages after a server restart gets no disclosure and their data is processed without LGPD consent.

**Why it happens:** State is in-memory. Restart clears all Maps. Server restart = every contact is "new" from the state's perspective.

**How to avoid:** The compliance flow is correct behavior on restart — a returning lead sees the disclosure again. This is acceptable for v1. The key is that the compliance check runs on every message unconditionally. Document this restart-clears-consent behavior explicitly.

**Warning signs:** Leads who restarted a conversation mid-session getting unexpected disclosure messages (expected behavior, but confusing if not documented).

[ASSUMED: restart-clears-consent is acceptable based on D-07 decision for v1]

---

### Pitfall 5: Disclaimer not appended when `complianceService` is bypassed

**What goes wrong:** Phase 2 will add Claude API calls. If the `appendDisclaimer()` call lives in `webhookHandler` rather than in a centralized place, future code paths (e.g., fallback messages, error responses) may bypass it.

**How to avoid:** `appendDisclaimer()` belongs in `complianceService.ts`. Any code path that sends a message to a lead through `digisacService` must call it. Document this contract clearly in code comments.

---

## Code Examples

### Complete env.ts

```typescript
// Source: CLAUDE.md + zod v4 [VERIFIED: ctx7 /colinhacks/zod]
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DIGISAC_API_URL:      z.string().url(),
  DIGISAC_API_TOKEN:    z.string().min(1),
  DIGISAC_SERVICE_ID:   z.string().min(1),
  WEBHOOK_SECRET:       z.string().min(1),
  ANTHROPIC_API_KEY:    z.string().min(1),
  CLAUDE_MODEL:         z.string().default('claude-sonnet-4-6'),
  DISCLOSURE_MESSAGE:   z.string().min(1),
  LGPD_CONSENT_MESSAGE: z.string().min(1),
  LEGAL_DISCLAIMER:     z.string().min(1),
  SYSTEM_PROMPT:        z.string().min(1),
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

### server.ts entry point

```typescript
// Source: CLAUDE.md stack conventions
import './utils/env'; // must be first — validates env before anything else
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { httpLogger, logger } from './utils/logger';
import { env } from './utils/env';
import router from './routes/index';

const app = express();

// Middleware order (Claude's Discretion — documented choice)
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 60 }));
app.use(express.json());
app.use(httpLogger);

app.use('/', router);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started');
});
```

### .env.example (complete Phase 1 template)

```env
# Digisac
DIGISAC_API_URL=https://api.sac.digital/v1
DIGISAC_API_TOKEN=
DIGISAC_SERVICE_ID=
WEBHOOK_SECRET=

# Anthropic
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-6

# Compliance texts (PLACEHOLDERS — review with escritório before production)
DISCLOSURE_MESSAGE=Olá! Sou um assistente virtual do escritório de advocacia. Sou uma inteligência artificial e não sou um advogado. Este atendimento é informativo.
LGPD_CONSENT_MESSAGE=Para continuar, precisamos do seu consentimento para processar seus dados conforme a LGPD (Lei 13.709/2018). Ao responder, você concorda com o uso dos seus dados para fins de atendimento. Continue com sua mensagem para prosseguir.
LEGAL_DISCLAIMER=Este atendimento é meramente informativo e não constitui aconselhamento jurídico. Consulte um advogado para orientação específica sobre seu caso.
SYSTEM_PROMPT=Você é um assistente de atendimento de um escritório de advocacia. Você NUNCA deve dar opiniões jurídicas definitivas, interpretar legislação específica, ou afirmar o que o cliente tem ou não direito de fazer. Use linguagem meramente informativa. Quando não souber uma resposta, diga explicitamente e oriente o cliente a aguardar um atendimento humano. Nunca prometa resultados ou prazos.

# Server
PORT=3000
NODE_ENV=development
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `express-async-errors` patch | Express 5 native async error handling | Express 5.0 (2024) | No extra package needed |
| `nodemon` for TS dev | `tsx watch` | 2023 | Single tool, no separate compilation |
| Winston logging | pino + pino-http | 2022-2023 | 5-8x faster, JSON-native |
| Hand-rolled fetch for Digisac | `@ikatec/digisac-api-sdk` | 2026-03-14 (SDK v2.1.1) | Full TypeScript types for webhook + REST |
| `joi` for env validation | `zod` v4 | 2024-2025 | Better TypeScript inference, single schema for runtime + types |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Restart-clears-consent is acceptable UX for v1 (returning lead sees disclosure again) | Compliance Service pattern | Leads who had prior consent show get re-consented on server restart — minor UX friction, not a blocking issue |
| A2 | `DIGISAC_SERVICE_ID` is a required env var (needed for `MessagesApi.create` `serviceId` field) | Env validation + digisacService | If Digisac infers serviceId from token context, this field may be optional — verify against actual Digisac account |
| A3 | Placeholder compliance texts (DISCLOSURE_MESSAGE etc.) are adequate for development/testing, not production | Env pattern | Texts must be reviewed by escritório + ideally a compliance professional before any real lead traffic |

---

## Open Questions

1. **Exact `serviceId` requirement for outbound messages**
   - What we know: `CreateMessagePayload.serviceId` is typed as `string | undefined` (optional in SDK)
   - What's unclear: Whether Digisac infers the service from the API token, or requires explicit serviceId on every message
   - Recommendation: Make `DIGISAC_SERVICE_ID` required in env schema for Phase 1; test with real credentials; relax to optional if Digisac infers it

2. **`origin: 'bot'` field significance for isFromMe filtering**
   - What we know: `CreateMessagePayload.origin: 'user' | 'bot'` is available in SDK; `Message.origin: string | null` is on the incoming payload
   - What's unclear: Whether Digisac fires a `message.created` webhook with `isFromMe: true` for all outbound messages, or whether bot-sent messages (`origin: 'bot'`) may be filtered server-side before webhook delivery
   - Recommendation: Guard on `isFromMe === true` is correct regardless; also log `msg.origin` during initial testing to understand what Digisac actually sends back

3. **OAB Provimento 205/2021 exact wording requirements**
   - What we know: The regulation requires identification as AI and prohibition of legal advice; D-03 placeholder texts are based on this
   - What's unclear: Whether the provimento mandates specific Portuguese phrasing or just principles
   - Recommendation: Treat placeholder texts as technical scaffolding; stakeholder review is a documented blocker in STATE.md before production

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 24.13.1 | — |
| npm | Package manager | ✓ | 11.8.0 | — |
| TypeScript (via tsx) | Development runner | Install required | — | — |
| Digisac API credentials | WBHK-02, COMP-01 | Not in env yet | — | Use ngrok + test account for development |
| Anthropic API key | COMP-04 (SYSTEM_PROMPT env var validation) | Not in env yet | — | Use placeholder for Phase 1 development |

**Missing dependencies with no fallback:**
- None that block Phase 1 implementation (all packages installable via npm)

**Missing dependencies with fallback:**
- Digisac credentials: development and unit testing can proceed without real credentials; integration testing requires an account

---

## Project Constraints (from CLAUDE.md)

All of the following directives from CLAUDE.md are binding on this phase:

| Directive | Impact on Phase 1 |
|-----------|-------------------|
| Never use `axios` | `digisacService.ts` MUST use `@ikatec/digisac-api-sdk` `MessagesApi`, not axios |
| Never use `nodemon` | Dev script uses `tsx watch src/server.ts` |
| Never use Winston/morgan | Use pino + pino-http only |
| Never use Redis/ioredis | In-memory Map for dedup and compliance state |
| Express ^5.2.1 (not 4.x) | No `express-async-errors` needed |
| Webhook secret is query param `?token=` | `req.query.token` extraction, not header |
| Zod for env validation (not joi) | `utils/env.ts` uses `z.object({...}).safeParse(process.env)` |
| Security: never version `.env` | `.gitignore` must exclude `.env`; `.env.example` is versioned |
| `origin: 'bot'` on outbound messages | `CreateMessagePayload` includes `origin: 'bot'` |
| Disclaimer append in code (not just prompt) | `complianceService.appendDisclaimer()` called on every AI response path |

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — no user login |
| V3 Session Management | No | No session tokens |
| V4 Access Control | Partial | Webhook token (`WEBHOOK_SECRET`) guards the single inbound endpoint |
| V5 Input Validation | Yes | Zod validates env; webhook payload typed via SDK |
| V6 Cryptography | Yes | `crypto.timingSafeEqual` for token comparison — never `===` |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Spoofed webhook (attacker POSTs to /webhook) | Spoofing | `crypto.timingSafeEqual` on `WEBHOOK_SECRET` query param; 401 on failure |
| Timing attack on token comparison | Information Disclosure | `timingSafeEqual` prevents; try/catch prevents length-based leakage |
| Message flood from Digisac or attacker | Denial of Service | `express-rate-limit` at 60 req/min per IP |
| HTTP header injection / clickjacking | Tampering | `helmet` middleware sets security headers |
| Bot responding to its own messages (infinite loop) | Denial of Service + financial | `isFromMe === true` guard; `origin: 'bot'` on outbound |
| Replay attack (old webhook resent) | Spoofing | Deduplication Map with 60s TTL blocks replays within window |
| Prompt injection from lead messages | Tampering (OWASP LLM01) | System prompt controls + no dynamic injection of user content into system role (Phase 2 concern; established here) |

---

## Sources

### Primary (HIGH confidence)
- `@ikatec/digisac-api-sdk` v2.1.1 — direct npm pack + type inspection (MessageType, WebhookPayload, MessagesApi, CreateMessagePayload)
- `npm view` registry — all package versions confirmed 2026-04-16
- Context7 `/colinhacks/zod` — env validation patterns for Zod v4
- Node.js built-in `crypto.timingSafeEqual` — documented behavior

### Secondary (MEDIUM confidence)
- `DIGISAC_IA_INTEGRATION.md` — project integration guide (note: contains `type === 'text'` error, corrected by SDK inspection)
- `.planning/research/ARCHITECTURE.md` — fire-and-forget, guard chain, error handling patterns
- `.planning/research/PITFALLS.md` — pitfall catalog with sources
- `.planning/research/STACK.md` — full stack rationale

### Tertiary (LOW confidence)
- OAB Provimento 205/2021 compliance wording — placeholder texts are ASSUMED, not verified with a compliance professional

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions npm-verified, SDK types directly inspected
- Architecture: HIGH — fire-and-forget and guard chain patterns are well-established and appear in multiple verified sources
- Compliance flow: MEDIUM — OAB/LGPD compliance logic is architecturally sound but exact wording needs stakeholder review
- Pitfalls: HIGH — `type === 'chat'` finding is directly SDK-verified; timing attack pattern is Node.js documented behavior

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable stack; Digisac SDK changelog should be checked if extending beyond this date)
