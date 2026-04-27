# Technology Stack

**Analysis Date:** 2026-04-20

## Languages

**Primary:**
- TypeScript 5.9.x — all source code under `src/`

**Secondary:**
- JSON — configuration files (`tsconfig.json`, `railway.json`, `package.json`)

## Runtime

**Environment:**
- Node.js >= 20 (LTS) — enforced via `engines.node` in `package.json`
- ES Module mode — `"type": "module"` in `package.json`; all imports use `.js` extension aliases

**Package Manager:**
- npm — lockfile `package-lock.json` present and committed

## Frameworks

**Core:**
- Express 5.2.x — HTTP server; async errors handled natively (no `express-async-errors` needed)

**Build/Dev:**
- tsx 4.21.x — TypeScript runner; `tsx watch src/server.ts` in dev, `node --import tsx/esm src/server.ts` in production (Railway)
- TypeScript 5.9.x — type checking only via `tsc --noEmit`; no tsc compilation to dist in production

## Key Dependencies

**Critical (production):**

| Package | Version | Purpose |
|---------|---------|---------|
| `openai` | ^4.98.0 | OpenAI chat completions — `client.chat.completions.create()` |
| `@ikatec/digisac-api-sdk` | ^2.1.1 | Digisac WhatsApp API client and webhook types |
| `async-mutex` | ^0.5.0 | Per-contact mutex in `aiService.ts` to serialize concurrent messages |
| `zod` | ^4.3.6 | Env var validation at startup with fail-fast behavior |
| `dotenv` | ^17.4.2 | `.env` → `process.env` loader; imported via `dotenv/config` |
| `helmet` | ^8.1.0 | HTTP security headers (OWASP defaults) |
| `express-rate-limit` | ^8.3.2 | 60 req/min per IP, in-process Map store |
| `pino` | ^10.3.1 | Structured JSON logging |
| `pino-http` | ^11.0.0 | Express request logging middleware |

**Dev only:**

| Package | Version | Purpose |
|---------|---------|---------|
| `pino-pretty` | ^13.1.3 | Human-readable terminal output in dev |
| `tsx` | ^4.21.0 | TypeScript runner |
| `typescript` | ^5.9.3 | Type checking |
| `@types/node` | ^20 | Node.js type definitions |
| `@types/express` | ^5 | Express type definitions |

## TypeScript Configuration

**Key settings in `tsconfig.json`:**
- `target`: ES2022
- `module`: NodeNext + `moduleResolution`: NodeNext — strict ESM resolution
- `strict`: true, `noImplicitAny`: true, `strictNullChecks`: true
- `noUnusedLocals`: true, `noUnusedParameters`: true, `noImplicitReturns`: true
- `rootDir`: `./src`, `outDir`: `./dist` (dist not used in production)

## Configuration

**Environment:**
- All configuration via `.env` file (local) or Railway environment variables (production)
- Validated at startup via Zod schema in `src/utils/env.ts` — process exits if invalid
- `.env` is gitignored; `.env.example` documents all required vars

**Build:**
- No compile step — tsx runs `.ts` files directly
- `railway.json` configures production start command: `node --import tsx/esm src/server.ts`

## Platform Requirements

**Development:**
- Node.js >= 20, npm
- `.env` file populated from `.env.example`

**Production:**
- Railway (PaaS) — Linux container
- Bind address: `0.0.0.0` (explicit, required for Railway health check)
- Health check endpoint: `GET /health` (checked before rate-limit middleware)
- Restart policy: `ON_FAILURE`, max 3 retries
- Persistent volume for `data/paused.json` — mount at `/data`, set `PAUSED_STATE_FILE=/data/paused.json`

---

*Stack analysis: 2026-04-20*
