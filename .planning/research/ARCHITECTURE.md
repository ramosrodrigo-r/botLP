# Architecture Patterns — WhatsApp AI Bot (botLP)

**Domain:** WhatsApp webhook receiver + AI response pipeline
**Researched:** 2026-04-16
**Overall confidence:** HIGH (patterns verified across official docs and multiple production references)

---

## Recommended Architecture

Five components with clean boundaries. No component knows the internals of another.

```
┌─────────────────────────────────────────────────────────────────┐
│                        DIGISAC PLATFORM                         │
│  (WhatsApp Cloud API wrapper — Brazilian CRM)                   │
└────────────────────┬─────────────────────────────▲─────────────┘
                     │ POST /webhook                │ POST /messages
                     │ (incoming message)           │ (outgoing reply)
                     ▼                              │
┌─────────────────────────────────────────────────────────────────┐
│                     EXPRESS SERVER                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  WEBHOOK RECEIVER  (src/routes/webhook.js)               │   │
│  │  • Validate token header                                  │   │
│  │  • Filter isFromMe + non-text events                      │   │
│  │  • Reply HTTP 200 immediately                             │   │
│  │  • Hand payload to Message Processor (fire-and-forget)   │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │ setImmediate / Promise (async)       │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MESSAGE PROCESSOR  (src/services/messageProcessor.js)   │   │
│  │  • Check HandoffManager → if paused, discard silently    │   │
│  │  • Load history from ConversationStore                   │   │
│  │  • Call AI Service → get reply text                      │   │
│  │  • Detect handoff signal in reply                        │   │
│  │  • Call Digisac Service → send reply                     │   │
│  │  • Update ConversationStore with user + assistant turns  │   │
│  └────┬───────────────┬──────────────────┬──────────────────┘   │
│       │               │                  │                       │
│       ▼               ▼                  ▼                       │
│  ┌─────────┐  ┌──────────────┐  ┌────────────────────────┐      │
│  │HANDOFF  │  │CONVERSATION  │  │  AI SERVICE            │      │
│  │MANAGER  │  │STORE         │  │  (src/services/        │      │
│  │         │  │              │  │   aiService.js)        │      │
│  │Map<id,  │  │Map<id,       │  │                        │      │
│  │boolean> │  │Message[]>    │  │• Build messages array  │      │
│  │         │  │              │  │• Call Claude API       │      │
│  │pause()  │  │append()      │  │• Return reply string   │      │
│  │resume() │  │get()         │  │• Throw on API errors   │      │
│  │isPaused │  │trim()        │  └──────────┬─────────────┘      │
│  └─────────┘  └──────────────┘             │                    │
│                                            │                    │
│                                            ▼                    │
│                              ┌──────────────────────────┐       │
│                              │  DIGISAC SERVICE         │       │
│                              │  (src/services/          │       │
│                              │   digisacService.js)     │       │
│                              │                          │       │
│                              │• sendMessage(id, text)   │       │
│                              │• axios POST to REST API  │       │
│                              │• Throw on HTTP errors    │       │
│                              └──────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | File | Responsibility | Does NOT know about |
|-----------|------|----------------|---------------------|
| Webhook Receiver | `src/routes/webhook.js` | HTTP ingress, validation, immediate 200 reply, fire-and-forget dispatch | Claude, Digisac, history |
| Message Processor | `src/services/messageProcessor.js` | Orchestrates the full pipeline for one inbound message | HTTP, Express internals |
| Conversation Store | `src/services/conversationStore.js` | In-memory history keyed by contactId, history trimming | Claude format, Digisac |
| AI Service | `src/services/aiService.js` | Calls Claude API, builds message array, returns string | Digisac, conversation storage |
| Digisac Service | `src/services/digisacService.js` | Sends outgoing messages via Digisac REST API | Claude, conversation state |
| Handoff Manager | `src/services/handoffManager.js` | Tracks which contactIds are paused for human attention | Claude, Digisac, history |

The Message Processor is the only component that coordinates across the others. All other components are leaves — they take inputs and return outputs or throw.

---

## Data Flow

A single inbound WhatsApp message moves through the system in two phases: the HTTP phase (synchronous, must be fast) and the processing phase (async, can be slow).

```
Phase 1 — HTTP (must complete in < 2 s)
═══════════════════════════════════════
1. Digisac POSTs to POST /webhook
2. Webhook Receiver validates token header → 401 if invalid
3. Webhook Receiver checks event type:
   - isFromMe = true  → reply 200, discard
   - type != text     → reply 200, discard
4. Reply HTTP 200 { received: true }   ← Digisac sees success here
5. setImmediate(processMessage, payload)  ← fire-and-forget


Phase 2 — Processing (async, errors logged not thrown)
═══════════════════════════════════════════════════════
6.  HandoffManager.isPaused(contactId)?
    → YES: log "bot paused for contact", return
    → NO:  continue

7.  ConversationStore.get(contactId)
    → returns Message[] (may be empty for new contact)

8.  AIService.getReply(systemPrompt, history, newUserMessage)
    → internally: build [{role,content},...] array
    → POST to Anthropic /v1/messages
    → returns replyText string

9.  Inspect replyText for handoff signal
    (e.g. contains "[HANDOFF]" marker set in system prompt)
    → if signal found:
       a. Strip marker from replyText
       b. HandoffManager.pause(contactId)
       c. Optionally send "transferring you" message

10. DigisacService.sendMessage(contactId, replyText)
    → POST to Digisac REST API

11. ConversationStore.append(contactId, userMessage)
    ConversationStore.append(contactId, assistantMessage)
    ConversationStore.trim(contactId, maxTurns=20)
```

**Why append history AFTER send (step 11)?**
If Digisac send fails, the exchange never happened from the user's perspective. Appending before send would corrupt history with a reply the user never received.

---

## In-Memory State Management

### ConversationStore

Use a plain `Map<string, Message[]>`. No class instantiation overhead needed — a module-level singleton is fine.

```javascript
// src/services/conversationStore.js
const store = new Map(); // contactId → Message[]

const MAX_TURNS = 20; // 20 pairs = 40 messages max per contact

export function getHistory(contactId) {
  return store.get(contactId) ?? [];
}

export function appendMessage(contactId, role, content) {
  const history = store.get(contactId) ?? [];
  history.push({ role, content });
  store.set(contactId, history);
}

export function trimHistory(contactId) {
  const history = store.get(contactId);
  if (history && history.length > MAX_TURNS * 2) {
    // Keep system context: drop oldest pairs, never drop index 0 if it's a system marker
    store.set(contactId, history.slice(-MAX_TURNS * 2));
  }
}

export function clearHistory(contactId) {
  store.delete(contactId);
}
```

**Key design decisions:**
- Module-level singleton: one Map for the lifetime of the process. No DI overhead.
- Trim after append, not before: always keep the most recent exchange.
- `MAX_TURNS = 20`: at ~150 tokens/turn, 20 turns = ~3,000 tokens of history. Well within Claude's context window and avoids runaway memory per contact.
- `clearHistory` exposed but not auto-called: human agent can call it after resolving a case if future integration is desired.

### HandoffManager

```javascript
// src/services/handoffManager.js
const pausedContacts = new Set(); // contactIds where human has taken over

export function pause(contactId)    { pausedContacts.add(contactId); }
export function resume(contactId)   { pausedContacts.delete(contactId); }
export function isPaused(contactId) { return pausedContacts.has(contactId); }
```

A `Set` is the right structure — O(1) lookup, clear semantics. Expose `resume()` now even if the first version has no UI to call it — it will be needed when a human marks a conversation resolved in Digisac.

---

## Error Handling

The core rule: **errors in the processing phase must never crash the server.** Wrap the entire `processMessage` in try/catch and log with structured context (contactId, error code, message).

### Claude API error matrix

| Error | Code | Handling |
|-------|------|----------|
| Invalid API key | 401 | Log critical, skip reply (human must fix config) |
| Rate limit hit | 429 | Log warning, skip reply for this message — do not retry inline |
| API overloaded | 529 | Same as 429 |
| Request timeout | 504 | Same as 429 |
| Invalid request | 400 | Log error with payload, skip reply (likely a code bug) |
| Network error | ECONNREFUSED / ETIMEDOUT | Log error, skip reply |

**Do not retry inline in v1.** A retry inside the webhook processing pipeline will block the Node.js event loop for the duration of the backoff (2s, 4s, 8s), which will delay processing subsequent messages for the same or other contacts. The correct v1 pattern is: log the failure with enough context that an operator can trigger a manual follow-up, and move on.

### Digisac send failure

If `DigisacService.sendMessage` throws:
1. Do NOT append to ConversationStore (history stays clean).
2. Log error with contactId and reply text (so it can be manually sent if needed).
3. Do NOT pause the bot — the AI succeeded, only delivery failed. The next message from the user will re-enter the pipeline normally.

### Webhook validation failure

Return HTTP 401 for invalid token. Return HTTP 200 and discard silently for `isFromMe` or non-text events — never return 4xx for events you intentionally ignore, as Digisac may retry on non-200 responses.

### Error response shape

Always log with structured fields:
```javascript
logger.error('claude_api_error', {
  contactId,
  errorType: err.status,     // 429, 504, etc.
  errorMessage: err.message,
  requestId: err.headers?.['request-id'], // Anthropic request-id for support
});
```

The `request-id` header from Anthropic is essential for debugging — always capture it.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Awaiting Claude inside the HTTP handler
**What:** `app.post('/webhook', async (req, res) => { const reply = await callClaude(); res.json(reply); })`
**Why bad:** Claude can take 5–30 seconds. Digisac has a short webhook timeout (typically 5–10 s). Digisac will mark the webhook as failed and retry, producing duplicate processing.
**Instead:** Reply 200 immediately, process async with `setImmediate`.

### Anti-Pattern 2: Appending history before sending the reply
**What:** Save assistant message to ConversationStore, then call Digisac.
**Why bad:** If Digisac fails, history now contains a message the user never received. Next invocation will present false context to Claude.
**Instead:** Append history only after a successful Digisac send.

### Anti-Pattern 3: No handoff gate at pipeline entry
**What:** Always calling Claude even for contacts under human management.
**Why bad:** Human agent and bot both reply simultaneously. User receives conflicting messages. Classic race condition in all WhatsApp + AI systems.
**Instead:** Check `HandoffManager.isPaused(contactId)` as the very first step in `processMessage`.

### Anti-Pattern 4: Unbounded conversation history
**What:** `history.push(message)` with no trim.
**Why bad:** Long-running contacts accumulate thousands of messages. Claude's input token cost scales linearly. At ~150 tokens/turn, 100 turns = ~15,000 tokens just for history. Server memory also grows unbounded.
**Instead:** Trim to last 20 turns after each append.

### Anti-Pattern 5: Global try/catch swallowing all errors silently
**What:** `try { await processMessage() } catch (e) { }` — empty catch.
**Why bad:** Silent failures. You will not know the bot stopped working until a client complains.
**Instead:** Always log with structured context in the catch block. In production, send an alert (console.error is enough for v1 — Railway/VPS logs are monitored externally).

---

## Build Order (end-to-end fast)

Build in this sequence to have a working HTTP pipeline after each step:

**Step 1 — Skeleton server + webhook endpoint (Day 1)**
`server.js` + `src/routes/webhook.js`
Accepts POST, logs raw payload, returns 200. Proves Digisac can reach the server.
Milestone: ngrok tunnel + Digisac configured, first webhook received and logged.

**Step 2 — Digisac Service (Day 1)**
`src/services/digisacService.js`
`sendMessage(contactId, text)` using axios. Test with a hardcoded string.
Milestone: Send a hardcoded "hello" reply to a real WhatsApp number.

**Step 3 — Conversation Store + AI Service (Day 2)**
`src/services/conversationStore.js` + `src/services/aiService.js`
Wire Claude API with system prompt. Pass empty history first, then real history.
Milestone: Real AI reply flows from WhatsApp message → Claude → WhatsApp reply.

**Step 4 — Message Processor (Day 2)**
`src/services/messageProcessor.js`
Orchestrates steps 2 + 3 with the fire-and-forget pattern. End-to-end pipeline complete.
Milestone: Full conversation with history works. Multi-turn context preserved.

**Step 5 — Handoff Manager (Day 3)**
`src/services/handoffManager.js`
Add pause detection from Claude reply signal. Pause set, subsequent messages discarded.
Milestone: Typing "[HANDOFF]" in a test reply pauses the bot for that contact.

**Step 6 — Hardening (Day 3–4)**
Add input validation, rate limiting (express-rate-limit), structured logging (pino or winston), `.env` validation (joi or zod on startup).
Milestone: Server rejects malformed requests; logs are structured JSON; startup fails fast on missing env vars.

This order means you have a working demo after Step 3 (roughly 6–8 hours of focused work). Steps 4–6 are production-readiness layers.

---

## Scalability Considerations

This architecture is intentionally sized for a single law firm's WhatsApp volume. The constraints below are documented so you know when to revisit, not because they are problems now.

| Concern | At current scale (1 firm) | Would break at | Migration path |
|---------|--------------------------|----------------|----------------|
| In-memory history | Fine — dozens of active contacts max | Server restart wipes history; ~1000 active contacts = ~10 MB | Add Redis or SQLite when restart-survival matters |
| No message queue | Fine — Node.js event loop handles async fine at low volume | Burst traffic (hundreds of simultaneous messages) | Add BullMQ + Redis worker |
| Single process | Fine — Railway/VPS runs one instance | Horizontal scaling needed | Externalize state to Redis first |
| Handoff Set in-memory | Fine — small Set, fast lookup | Multi-instance deployment | Move paused state to shared store |

---

## Sources

- Anthropic API error codes and timeout guidance: https://platform.claude.com/docs/en/api/errors
- Webhook respond-200-immediately pattern: https://dev.to/dumebii/building-a-robust-webhook-handler-in-nodejs-validation-queuing-and-retry-logic-2fb6
- Human handoff pausing pattern: https://www.connverz.com/blog/using-chatbots-human-handoff-in-whatsapp-automation
- In-memory bot state management: https://developer.vonage.com/en/blog/state-machines-for-messaging-bots
- WhatsApp AI bot architecture overview: https://wasenderapi.com/blog/whatsapp-chatgpt-api-integration-build-an-ai-chatbot-in-2025
