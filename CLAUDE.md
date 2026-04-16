<!-- GSD:project-start source:PROJECT.md -->
## Project

**botLP — Bot de Atendimento IA para Escritório de Advocacia**

Servidor Node.js + Express que integra o Digisac (WhatsApp) com a Claude API (Anthropic) para atender e qualificar leads automaticamente. Quando um lead manda mensagem no WhatsApp, o bot responde, coleta informações de qualificação (tipo de caso, urgência, intenção de contratar) e entrega o lead qualificado para o advogado fechar — transferindo para humano quando a IA não consegue avançar. Desenvolvido para um escritório de advocacia específico.

**Core Value:** O lead recebe resposta imediata, é qualificado pela IA (interesse, urgência, tipo de caso) e transferido para um advogado no momento certo — maximizando conversão sem sobrecarregar a equipe.

### Constraints

- **Segurança**: Nunca versionar `.env` com tokens reais — bot tem acesso a WhatsApp de clientes do escritório
- **Ética/Legal**: System prompt deve incluir disclaimer de que o bot não fornece aconselhamento jurídico — responsabilidade do escritório
- **API Digisac**: Requer HTTPS na URL do webhook — sem suporte a HTTP puro
- **Stack**: Node.js v20+ com Express — conforme especificado no documento de referência
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommendation: TypeScript
## Recommended Stack
### Runtime & Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 20 LTS | Runtime | Specified in PROJECT.md; LTS, native fetch, good `crypto` support for HMAC |
| TypeScript | ^5.5 | Language | Type safety, Digisac SDK types, refactoring safety |
| tsx | ^4.19 | TS runner (dev) | Run `.ts` files directly without tsc/nodemon setup; used as `node --import tsx/esm` |
| Express | ^5.2.1 | HTTP server | Industry standard, minimal, well-understood middleware ecosystem |
### Digisac Integration
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @ikatec/digisac-api-sdk | ^2.1.1 | Digisac REST API client + webhook types | Only production-quality TypeScript SDK for Digisac; ships `WebhookPayload<E>`, `MessagesApi.create()`, `ContactsApi`, typed `CreateMessagePayload`. Published 2026-03-14, actively maintained by ikatec team. |
### Anthropic / Claude
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @anthropic-ai/sdk | ^0.90.0 | Claude API | Official SDK; `client.messages.create()` accepts `messages: [{role, content}][]` directly — maps 1:1 to the in-memory history array pattern |
### Rate Limiting
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| express-rate-limit | ^8.3.2 | Webhook endpoint protection | Standard Express middleware, zero dependencies, in-process store is fine for single-instance deployment. No Redis needed at law firm message volumes. |
### Logging
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| pino | ^10.3.1 | Structured JSON logging | Fastest Node.js logger; JSON output ready for Railway's log viewer and any future log aggregator; async I/O so it doesn't block the event loop |
| pino-http | ^11.0.0 | Express request logging middleware | Wraps pino, auto-logs method, URL, status, response time per request; `req.log` child logger available in handlers |
| pino-pretty | ^13.x | Dev-only pretty printer | Human-readable in terminal; use only in development via `NODE_ENV=development` |
### Environment & Validation
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| dotenv | ^17.4.2 | Load `.env` into `process.env` | Standard; use `dotenv/config` import at entry point |
| zod | ^4.3.6 | Env var validation at startup | Validates that all required env vars are present and correctly typed before the server starts; fails fast with a clear error message instead of cryptic `undefined` crashes later |
### Security
| What | How | Library |
|------|-----|---------|
| Webhook token validation | Compare `Authorization` header (or query param `token`) against `WEBHOOK_SECRET` env var using `crypto.timingSafeEqual` | Node.js built-in `crypto` — no extra package needed |
| Body parsing security | Keep raw body for signature validation before JSON parsing | Express built-in `express.json()` with `verify` callback |
| HTTP security headers | Helmet middleware | `helmet` ^8.1.0 |
## Supporting Libraries (Optional but Recommended)
| Library | Version | Purpose | When to Add |
|---------|---------|---------|-------------|
| express-async-errors | ^3.1.1 | Forward async errors to Express error handler | Add immediately — without it, unhandled promise rejections in async route handlers crash the process silently in Express 4; not needed in Express 5 (which handles async natively) |
| uuid | ^13.0.0 | Generate correlation IDs for log tracing | Add if you want request-scoped log correlation; optional but useful for debugging |
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
## Conversation History Pattern
- Use `Anthropic.Messages.MessageParam[]` directly — no custom type needed, it's already exported by the SDK.
- Cap history length: trim to the last N turns before each API call to control token costs. Recommended: last 20 messages (10 exchanges). Implemented as a slice, not a ring buffer, at this scale.
- Never persist to disk. On restart, history resets — acceptable for v1 per PROJECT.md.
- Key is `contactId` (string UUID from Digisac's `data.contactId` on the webhook payload).
## Human Handoff Pattern
## Installation
# Initialize project with TypeScript
## Exact Versions Summary
| Package | Version | Type |
|---------|---------|------|
| express | ^5.2.1 | prod |
| @anthropic-ai/sdk | ^0.90.0 | prod |
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
## Sources
- Anthropic TypeScript SDK: Context7 `/anthropics/anthropic-sdk-typescript` (HIGH confidence)
- `@ikatec/digisac-api-sdk`: Direct npm registry inspection + package source extraction, version 2.1.1 (HIGH confidence)
- Digisac webhook payload structure: `pkg.go.dev/github.com/pericles-luz/go-base/pkg/digisac` (MEDIUM confidence — Go implementation mirrors JS payload; confirmed against SDK types)
- express-rate-limit: `npmjs.com/package/express-rate-limit` v8.3.2, MDN Blog (HIGH confidence)
- pino + pino-http: BetterStack guide, SigNoz 2026 guide, npm registry (HIGH confidence)
- Webhook HMAC/token validation: hookdeck.com, GitHub webhook docs pattern (HIGH confidence for pattern; Digisac-specific token mechanism is MEDIUM — documented behavior inferred from community integrations)
- TypeScript vs JavaScript tradeoff: DEV Community, tech-insider.org 2026 survey (MEDIUM confidence — editorial judgment applied)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
