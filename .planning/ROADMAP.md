# Roadmap: botLP — Bot de Atendimento IA para Escritório de Advocacia

## Overview

Build a WhatsApp lead qualification bot for a law firm in four phases: first secure the webhook entry point and embed all OAB/LGPD compliance requirements (compliance cannot be retrofitted); then assemble the full AI conversation pipeline with race-condition protection; then add lead qualification prompting and human handoff with restart-safe state persistence; finally harden the system for production deployment on Railway. Each phase delivers a coherent, testable capability — the compliance layer goes in before any real lead ever reaches the AI.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Webhook Infrastructure + Compliance Foundation** - Secure webhook receiver with four-layer guard, OAB/LGPD compliance embedded at entry (completed 2026-04-16)
- [ ] **Phase 2: Conversation History + AI Pipeline** - Full end-to-end WhatsApp → Claude → WhatsApp flow with mutex-protected history
- [ ] **Phase 3: Lead Qualification + Handoff** - Natural intake qualification via prompt engineering and human handoff with persistent pause state
- [ ] **Phase 4: Production Hardening** - Railway deploy, adversarial testing, and compliance verification before law firm goes live

## Phase Details

### Phase 1: Webhook Infrastructure + Compliance Foundation
**Goal**: A server that safely receives Digisac webhooks, validates token, filters every non-actionable event, responds HTTP 200 immediately, and appends the legal disclaimer to every AI response — with OAB and LGPD compliance wired in from the first lead interaction
**Depends on**: Nothing (first phase)
**Requirements**: WBHK-01, WBHK-02, WBHK-03, WBHK-04, WBHK-05, WBHK-06, COMP-01, COMP-02, COMP-03, COMP-04, OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. A test webhook with a valid token returns HTTP 200; a webhook with an invalid token returns HTTP 401
  2. A simulated bot-sent message (isFromMe: true) produces no outgoing Digisac API call and logs a discarded-event entry
  3. A new lead's first message triggers an AI disclosure message identifying the bot as IA, followed by LGPD consent prompt before any data collection begins
  4. Every AI response — regardless of content — has the no-legal-advice disclaimer appended in code (visible in test output, not just in system prompt)
  5. Server startup fails fast with a clear error if any required env var (DIGISAC_TOKEN, OPENAI_API_KEY, etc.) is missing
**Plans:** 3/3 plans complete
Plans:
- [x] 01-01-PLAN.md — Bootstrap TS project, Zod env validation, pino logger, SDK type re-exports, AI stub
- [x] 01-02-PLAN.md — Digisac SDK service wrapper + compliance service (disclosure, LGPD consent, disclaimer append)
- [x] 01-03-PLAN.md — Express server + rate-limited webhook route with timing-safe token validation + 4-guard handler (human-verify checkpoint)

### Phase 2: Conversation History + AI Pipeline
**Goal**: A working multi-turn conversation loop — WhatsApp message arrives, conversation history loads with mutex lock, OpenAI is called with full context, reply is sent to lead via Digisac, history is updated — with deduplication and 429 fallback handling
**Depends on**: Phase 1
**Requirements**: CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05
**Success Criteria** (what must be TRUE):
  1. Sending two messages in rapid succession from the same contactId results in exactly two AI replies with correct context (no duplicate history, no interleaved responses)
  2. A conversation spanning more than 20 turns evicts oldest messages while preserving context; a contact inactive for 24+ hours gets a fresh history on next message
  3. A simulated OpenAI 429 error sends a graceful fallback message to the lead and logs the event for follow-up — without crashing the server
  4. The system prompt is sourced from the SYSTEM_PROMPT env var; changing it without code changes alters bot behavior on the next message
  5. After a full exchange, the bot has gathered lead name, case area, urgency level, and hiring intent through natural conversation (not form-style prompting)
**Plans:** 2 plans
Plans:
- [ ] 02-01-PLAN.md — Create sessionService (unified SessionState) + refactor complianceService + add OPENAI_FALLBACK_MESSAGE env var
- [ ] 02-02-PLAN.md — Install async-mutex, rewrite aiService with mutex/TTL/429 handling, wire webhookHandler + SYSTEM_PROMPT placeholder for QUAL-01..05
**UI hint**: no

### Phase 3: Lead Qualification + Handoff
**Goal**: The bot detects when it cannot help further, signals handoff via the [HANDOFF] marker, pauses itself for that contactId, notifies the lead that an attorney will take over, and maintains pause state across server restarts
**Depends on**: Phase 2
**Requirements**: HAND-01, HAND-02, HAND-03, HAND-04, HAND-05
**Success Criteria** (what must be TRUE):
  1. When Claude includes [HANDOFF] in its reply, the lead receives the handoff notification message but the marker itself is stripped from the sent text
  2. After handoff is triggered, subsequent messages from the same contactId produce no AI reply and no Claude API call
  3. Restarting the server does not clear the paused-contacts state — a contact paused before restart remains paused after restart
  4. An urgency keyword message (e.g., "preso", "liminar", "audiência amanhã") triggers immediate handoff, bypassing the normal qualification flow
**Plans**: TBD

### Phase 4: Production Hardening
**Goal**: The bot is deployed on Railway with structured logs readable in the Railway viewer, all compliance requirements verified under real (or simulated) lead interactions, adversarial prompt test cases documented and passing, and the firm can confidently switch on WhatsApp traffic
**Depends on**: Phase 3
**Requirements**: (no unassigned v1 requirements — this phase validates the full system under production conditions)
**Success Criteria** (what must be TRUE):
  1. Bot is live on Railway responding to real Digisac webhooks with no cold-start timeout errors
  2. Structured pino logs for a full lead interaction — webhook receipt, OpenAI call, Digisac send, handoff trigger — are readable and filterable in Railway log viewer
  3. Three adversarial prompts designed to elicit legal opinions receive responses that contain the disclaimer and redirect to human contact without giving opinions
  4. The Digisac origin field filter behavior (isFromMe + agent-origin messages) is confirmed against real traffic and logged behavior matches expected filtering
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Webhook Infrastructure + Compliance Foundation | 3/3 | Complete   | 2026-04-16 |
| 2. Conversation History + AI Pipeline | 0/TBD | Not started | - |
| 3. Lead Qualification + Handoff | 0/TBD | Not started | - |
| 4. Production Hardening | 0/TBD | Not started | - |
