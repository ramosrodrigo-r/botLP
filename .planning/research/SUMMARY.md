# Project Research Summary

**Project:** botLP — Bot de Atendimento IA para Escritório de Advocacia
**Domain:** WhatsApp webhook receiver + AI lead qualification pipeline for a regulated professional services firm
**Researched:** 2026-04-16
**Confidence:** HIGH

## Executive Summary

botLP is a narrow-purpose conversational AI bot that sits between Digisac (WhatsApp CRM) and the Claude API to qualify legal leads 24/7 for a Brazilian law firm. Research across all four domains confirms this is a well-understood integration pattern — webhook receiver, async AI pipeline, in-memory state, human handoff — with one unusual constraint: the law firm regulatory environment (OAB + LGPD) makes content and behavior requirements as load-bearing as technical ones. The system must disclose AI identity, never give legal opinions, collect LGPD consent before any data, and always provide an escalation path to a human attorney. These are not nice-to-haves; violating them creates disciplinary and civil liability for the firm.

The recommended approach is TypeScript + Express 5 + `@ikatec/digisac-api-sdk` + `openai`, deployed as a single-process server on Railway. The architecture is six components with clean boundaries: Webhook Receiver, Message Processor, Conversation Store, AI Service, Digisac Service, and Handoff Manager. The critical implementation sequence is: return HTTP 200 immediately (fire-and-forget async processing), guard against `isFromMe` loops and duplicate delivery, use a per-contactId mutex for race conditions, and cap history at 20 turns with TTL eviction. A working end-to-end pipeline can be reached in roughly 6-8 hours by following the documented build order.

The dominant risks are not purely technical — they are the intersection of technical mistakes and legal consequences. A bot that responds to its own messages floods a lead with dozens of AI-generated texts. A bot that gives a confident legal opinion exposes the firm to OAB disciplinary action. A bot that loses its handoff pause state on restart interrupts an attorney mid-conversation with a client. Each of these has a documented 10-20 line prevention strategy. None requires significant architectural complexity. The v1 scope as defined in PROJECT.md is achievable and appropriate; the four items flagged for v2 (structured handoff summary, CRM tagging, persistent intake log, calendar integration) are genuinely deferrable.

---

## Key Findings

### Recommended Stack

The stack is TypeScript-first because the `@ikatec/digisac-api-sdk` ships TypeScript types that make webhook payload handling safe and self-documenting — `WebhookPayload<'message.created'>` narrows the payload to the correct shape, which matters when routing real client messages. Using plain JavaScript discards the one tool that prevents the wrong `contactId` from reaching the wrong function. Express 5.2.x (stable since 2024) handles async errors natively, eliminating the need for `express-async-errors`. All packages verified on npm registry with exact versions.

**Core technologies:**
- `Node.js 20 LTS` + `TypeScript ^5.5` + `tsx ^4.19`: runtime and language; tsx runs TypeScript directly with no build step in development
- `Express ^5.2.1`: HTTP server; async error handling built-in in v5
- `@ikatec/digisac-api-sdk ^2.1.1`: only production-quality TypeScript SDK for Digisac; ships `WebhookPayload<E>`, `MessagesApi.create()`, and `ContactsApi`
- `openai ^4.98.0`: official OpenAI SDK; `client.chat.completions.create()` maps 1:1 to the in-memory `ChatCompletionMessageParam[]` history array
- `pino ^10.3.1` + `pino-http ^11.0.0`: structured JSON logging; async I/O, Railway-compatible
- `zod ^4.3.6`: env var validation at startup; fails fast on missing credentials before server accepts traffic
- `express-rate-limit ^8.3.2`: webhook endpoint protection; in-memory store sufficient for single instance
- `helmet ^8.1.0`: HTTP security headers
- `async-mutex` (add in Phase 2): per-contactId locking for race condition prevention

**Do not add:** Redis, BullMQ, Prisma/TypeORM, axios, Winston, or nodemon. All are explicitly out of scope for v1 and add operational cost with no benefit at law firm message volumes.

### Expected Features

Research confirms the feature set in PROJECT.md is correctly scoped. The OAB and LGPD constraints add mandatory behavior that must be wired in from Phase 1 — they cannot be retrofitted.

**Must have in v1 (table stakes + legal requirements):**
- AI identity disclosure in first message — OAB Recomendação 001/2024 + WhatsApp Business Platform 2026 policy
- No-legal-advice disclaimer appended in code on every response (not just system prompt) — OAB Code of Ethics Art. 34 XI
- LGPD consent acknowledgment before any data collection — Lei 13.709/2018
- Human handoff with contactId-level pause guard — WhatsApp Business Platform 2026 policy + OAB ethics
- Scope restriction to firm's practice areas — OAB Provimento 205/2021 (informative only, no persuasive language)
- Graceful unknown-input handling with explicit redirect to human
- `isFromMe` guard and non-text message filter (explicit "only text" response to leads)
- Webhook token validation with `crypto.timingSafeEqual`
- Urgency detection (keywords: "preso", "mandado", "prazo", "liminar", "audiência amanhã", "violência", "despejo") — triggers immediate handoff, bypasses intake qualification flow

**Should have (differentiators, achievable via prompt engineering in v1):**
- Structured intake qualification: name, case type, urgency, intent to hire — LLM-guided conversation, not a rigid form
- FAQ deflection: office hours, coverage area, consultation cost — zero code complexity, pure prompt engineering
- After-hours availability signaling with realistic return time expectations
- Practice area routing signal surfaced in conversation log for attorney review

**Defer to v2:**
- Structured handoff summary (requires second LLM call or structured extraction)
- Persistent intake data logging (requires database)
- Practice area routing with explicit CRM tagging
- Appointment booking with calendar integration

**Critical anti-features (must actively prevent):**
- Giving legal opinions or predicting outcomes — OAB liability
- Impersonating a human attorney — OAB ethics + WhatsApp policy
- Collecting CPF, financial details, or medical history — LGPD purpose limitation violation
- General-purpose AI responses outside legal intake scope — WhatsApp Business Platform ban (effective January 15, 2026)

### Architecture Approach

Six components with clean, unidirectional boundaries. The Webhook Receiver is the only component that touches Express; it returns HTTP 200 immediately and fires processing asynchronously. The Message Processor is the single orchestrator — the only component that calls across others. All other components are pure leaf services: they take inputs, return outputs, and throw on error. This separation means each component can be tested independently and replaced without affecting others.

**Major components:**
1. **Webhook Receiver** (`src/routes/webhook.ts`) — validates token, filters `isFromMe` + non-text + non-`message.received` events, returns 200 immediately, fires async processing via `setImmediate`
2. **Message Processor** (`src/services/messageProcessor.ts`) — checks handoff pause, loads history, calls AI Service, detects `[HANDOFF]` signal in reply, sends via Digisac Service, appends to history (in that order)
3. **Conversation Store** (`src/services/conversationStore.ts`) — `Map<contactId, MessageParam[]>` with 20-turn cap and 24-hour TTL eviction; per-contactId mutex acquired before read-modify-write
4. **AI Service** (`src/services/aiService.ts`) — builds message array, calls Claude API with `max_tokens: 2048`, returns reply string; handles 429/529 with fallback message trigger
5. **Digisac Service** (`src/services/digisacService.ts`) — sends outgoing messages via Digisac REST API; throws on HTTP errors
6. **Handoff Manager** (`src/services/handoffManager.ts`) — `Set<contactId>` with SIGTERM persistence to JSON file and 8-hour auto-expiry; exposes `pause`, `resume`, `isPaused`

**Key data flow rule:** History is appended to Conversation Store only after Digisac send succeeds. If send fails, history stays clean — the next user message re-enters the pipeline with correct context.

### Critical Pitfalls

1. **Infinite response loop from missing `isFromMe` guard** — Bot responds to its own outgoing messages, generating dozens of Claude calls in seconds. Prevention: four-layer guard at webhook entry (event type → `isFromMe` → message type → handoff pause), all before any async work. Log every discarded event to make loops visible.

2. **Webhook duplicate delivery from synchronous Claude call** — Claude can take 5-30 seconds; Digisac's webhook timeout is 5-15 seconds. Holding the HTTP connection open causes Digisac to retry, producing duplicate messages and corrupted history. Prevention: return HTTP 200 immediately + `setImmediate` for async processing + in-memory deduplication Set keyed by `message.id` with 60-second TTL.

3. **Race condition from two concurrent messages by same contact** — Both webhooks read history simultaneously before either writes back. History ends up with duplicate user messages and interleaved responses. Prevention: `async-mutex`, per-contactId `Mutex`, acquired before reading history, released in `finally`.

4. **Handoff pause state lost on server restart** — `pausedContacts` Set is in-memory; a Railway deploy or crash clears it. Bot resumes mid-human-conversation. Prevention: persist Set to `./data/paused-contacts.json` on SIGTERM (Railway sends SIGTERM before stopping container); load on startup; add 8-hour auto-expiry to prevent permanently stuck contacts.

5. **AI hallucinating legal information** — Claude may invent statutes, deadlines, or case law even with a restrictive system prompt. OAB disciplinary consequences for the firm are material. Prevention: hard prohibition in system prompt + code-level disclaimer appended on every response + adversarial prompt testing. The disclaimer must be in code — Claude may omit it if only in the prompt.

---

## Implications for Roadmap

Based on research, the project maps naturally to four phases. The build order from ARCHITECTURE.md has been validated against the pitfall phase warnings in PITFALLS.md — the sequence below is not arbitrary.

### Phase 1: Webhook Infrastructure + Compliance Foundation

**Rationale:** The webhook receiver with all its guards is the entry point for every subsequent feature. The four-layer guard (event type, `isFromMe`, message type, handoff pause) must be in place before any real traffic reaches Claude. The compliance requirements (AI disclosure, LGPD consent, no-legal-advice disclaimer) belong in the system prompt and first-message template, which must be defined before any real lead interaction. Both concerns — webhook security and compliance content — are Phase 1 because getting either wrong is immediately visible and immediately damaging.

**Delivers:** A server that safely receives Digisac webhooks, validates token, filters non-actionable events, replies 200 immediately, and appends legal disclaimer to every response. A configured system prompt with OAB + LGPD compliant behavior baked in. End-to-end proof: Digisac can reach the server and the server handles messages without looping.

**Addresses:** AI identity disclosure, code-level no-legal-advice disclaimer, LGPD consent template, `isFromMe` guard, non-text message filter, webhook token validation, rate limiting, structured logging, env var validation at startup, scope restriction to practice areas

**Avoids:** Infinite response loop (Pitfall 1), webhook duplicate delivery (Pitfall 2 — 200 immediate), missing webhook signature validation (Pitfall 9), legal hallucination (Pitfall 6 — disclaimer in code), prompt injection (Pitfall 6 — hardened system prompt)

### Phase 2: Conversation History + AI Pipeline

**Rationale:** With a safe webhook foundation, the core value loop can be assembled. The Conversation Store and AI Service are built together because they are tightly coupled — the history format is `Anthropic.Messages.MessageParam[]` and must match what the SDK expects. The per-contactId mutex (Pitfall 3) and TTL eviction (Pitfall 5) must be built into the Conversation Store from the start; retrofitting them after production traffic starts is painful and risky.

**Delivers:** Full end-to-end message flow — WhatsApp message arrives, history is loaded, Claude is called with context, reply is sent, history is updated. Multi-turn conversation with context preserved. Real AI reply flowing WhatsApp → Claude → WhatsApp.

**Uses:** `openai`, `@ikatec/digisac-api-sdk`, `async-mutex`, `OpenAI.Chat.ChatCompletionMessageParam[]` history type

**Implements:** Conversation Store with 20-turn cap + 24-hour TTL eviction + per-contactId mutex, AI Service with OpenAI API call + 429 fallback message, Digisac Service, Message Processor orchestrating the pipeline with fire-and-forget pattern

**Avoids:** Race condition (Pitfall 3 — mutex), memory leak (Pitfall 5 — TTL eviction), token bloat (Pitfall 8 — history cap + system prompt caching), truncated replies (Pitfall 12 — `max_tokens: 2048`), duplicate delivery (Pitfall 2 — deduplication Set)

### Phase 3: Lead Qualification + Handoff

**Rationale:** With the pipeline working, the qualification behavior and handoff logic can be layered on. These are primarily prompt engineering and state management additions — no new infrastructure components. The handoff manager is architecturally simple (a Set with persistence) but its persistence pattern (SIGTERM write, startup read, auto-expiry) must be correct from the first production deploy.

**Delivers:** Bot conducts natural intake qualification (name, case type, urgency, intent to hire), detects urgency keywords for immediate escalation, signals handoff via `[HANDOFF]` marker in Claude reply, pauses bot for that contactId, alerts human staff via Digisac. Handoff state survives server restarts. FAQ deflection and after-hours signaling active.

**Implements:** Handoff Manager with SIGTERM persistence + 8-hour auto-expiry, urgency keyword detection (bypasses intake flow), `[HANDOFF]` signal parsing in Message Processor, intake qualification system prompt additions, FAQ deflection, after-hours messaging, practice area routing signal

**Avoids:** Handoff state lost on restart (Pitfall 7 — SIGTERM persistence), bot resuming mid-human-conversation (Pitfall 7 — file load on startup), scope creep into general-purpose AI (FEATURES.md anti-feature), simultaneous bot + human reply (Pitfall 3 — handoff gate at pipeline entry)

### Phase 4: Hardening + Production Readiness

**Rationale:** The previous three phases produce a working bot. Phase 4 adds the operational layer: production deployment on Railway, cold-start avoidance, structured log review, adversarial system prompt testing, and confirmation that all compliance requirements hold under real traffic. This phase is about confirming the bot behaves correctly under edge cases and that the firm's compliance posture is defensible before the firm's clients interact with it.

**Delivers:** Production-deployed bot on Railway with no cold start, `/health` endpoint, structured pino logs readable in Railway log viewer, OpenAI rate limits verified, `x-ratelimit-remaining-requests` header monitored, adversarial prompt test cases documented, LGPD consent flow reviewed by firm stakeholders.

**Addresses:** Railway production deploy (no cold start vs. Render free tier), `/health` endpoint + UptimeRobot keep-warm, OpenAI account rate limit verification, response header monitoring, weekly adversarial prompt testing process established

**Avoids:** Cold start delays triggering webhook timeouts (Pitfall 13), silent Claude API failures with no operator alert (Pitfall 4), undetected legal hallucinations entering production (Pitfall 6)

### Phase Ordering Rationale

- **Compliance before conversation:** OAB and LGPD requirements cannot be retrofitted. A single lead interaction with a non-compliant bot creates exposure. Phase 1 embeds compliance at the foundation, not as a later addition.
- **Guards before logic:** The four-layer webhook guard eliminates the worst failure modes (loop, duplicates) before any real processing happens. Building the AI pipeline on a guarded foundation means errors are bounded and recoverable.
- **Mutex and eviction at store creation:** Adding the per-contactId mutex and TTL eviction after the Conversation Store is already deployed requires taking the server down during active lead conversations. Building them in at Phase 2 costs 30 lines of code and prevents a production incident.
- **Handoff after pipeline:** The handoff manager depends on the Message Processor being able to detect and route signals. Building it in Phase 3, once the processor exists, avoids premature abstraction.
- **Hardening last:** Operational concerns (monitoring, adversarial testing, Tier 2 upgrade) require a working system to test against. Phase 4 is short precisely because Phases 1-3 built correctly.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (system prompt wording):** The exact OAB-compliant Portuguese wording for AI disclosure, LGPD consent, and no-legal-advice disclaimer needs review with the law firm. Technical implementation is clear; exact language is not researched.
- **Phase 3 (Digisac transfer API):** The exact Digisac API call for transferring a conversation to a human agent queue was not verified in this research pass. The `MessagesApi` for sending messages is confirmed; the transfer/ticket assignment API surface needs a focused review of Digisac's REST API docs before Phase 3 implementation begins.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Anthropic SDK):** Fully documented in official SDK docs; `messages.create()` with `MessageParam[]` history is a standard, verified pattern.
- **Phase 4 (Railway deployment):** Standard Railway Node.js deployment; no research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified on npm registry with exact versions; Digisac SDK inspected directly from npm; Anthropic SDK verified via Context7 |
| Features | HIGH | OAB Recomendação 001/2024 and Provimento 205/2021 are official documents; WhatsApp Business Platform policy confirmed from Meta; LGPD requirements well-documented |
| Architecture | HIGH | Patterns verified across official docs and multiple production references; data flow decisions (append-after-send, fire-and-forget 200) are standard webhook best practices |
| Pitfalls | HIGH | Critical pitfalls sourced from official Anthropic rate-limit docs, OWASP GenAI Top 10 2025, async-mutex npm docs, and real-world community post-mortems |

**Overall confidence:** HIGH

### Gaps to Address

- **Digisac transfer/ticket API:** Research confirms `MessagesApi.create()` for sending messages but did not verify the specific API call for transferring a conversation to a human agent queue in Digisac. Needs focused review of Digisac REST API docs before Phase 3 begins.
- **OAB-compliant disclaimer wording:** Technical requirement and code pattern are clear. Exact Portuguese wording satisfying OAB Recomendação 001/2024 in practice should be reviewed with the law firm before going live.
- **Digisac `origin` field values:** PITFALLS.md notes that `isFromMe` alone may not filter agent-sent messages — the `origin` field may need to be checked as well. Exact values (e.g., `'bot'`, `'agent'`, `'api'`) should be logged and inspected during Phase 1 development to confirm the filtering strategy.
- **OpenAI account rate limits:** The 429 handling strategy is correct, but the exact rate limits of the OpenAI account being used should be verified in the OpenAI dashboard before any production traffic.

---

## Sources

### Primary (HIGH confidence)
- `@ikatec/digisac-api-sdk` npm registry + package source inspection — SDK types, `WebhookPayload<E>`, `MessagesApi`, version 2.1.1
- OpenAI TypeScript SDK via npm registry + Context7 `/openai/openai-node` — `chat.completions.create()`, `ChatCompletionMessageParam[]`, error handling
- OpenAI official API docs (`platform.openai.com`) — rate limits, error codes, `retry-after` behavior, `x-request-id` header
- OAB Recomendação 001/2024 — AI transparency requirements for legal practice in Brazil
- OAB Provimento 205/2021 — legal advertising and client-facing communication rules
- WhatsApp Business Platform 2026 policy (Meta via respond.io) — AI chatbot ban scope, disclosure requirements, human escalation mandate
- OWASP LLM Top 10 2025 — LLM01 Prompt Injection, LLM09 Misinformation
- `async-mutex` npm package — per-contactId locking pattern
- `express-rate-limit` npm v8.3.2
- Hookdeck webhook idempotency guide — deduplication Set pattern

### Secondary (MEDIUM confidence)
- Digisac webhook payload structure inferred from `pkg.go.dev/github.com/pericles-luz/go-base/pkg/digisac` — confirmed against SDK types but Go implementation
- LGPD chatbot compliance analysis (blip.ai) — consent and purpose limitation requirements
- BetterStack + SigNoz 2026 guides — pino structured logging setup
- n8n community post-mortem — WhatsApp webhook infinite loop real-world case
- Harris Beach Murtha + Stanford Law — AI chatbot legal liability analysis
- Connverz blog — human handoff pausing pattern in WhatsApp automation

### Tertiary (LOW confidence — validate during implementation)
- Digisac `origin` field values for filtering agent messages — inferred from community integrations, not confirmed against official Digisac API docs

---
*Research completed: 2026-04-16*
*Ready for roadmap: yes*
