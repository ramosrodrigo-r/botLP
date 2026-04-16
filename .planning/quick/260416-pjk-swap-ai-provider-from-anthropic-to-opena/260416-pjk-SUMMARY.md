---
phase: quick-260416-pjk
plan: "01"
subsystem: ai-provider-swap
tags: [openai, anthropic, provider-swap, env, aiService, docs]
dependency_graph:
  requires:
    - src/utils/env.ts
    - src/services/aiService.ts
    - package.json
  provides:
    - OpenAI SDK integration with chat.completions.create
    - OPENAI_API_KEY + OPENAI_MODEL env validation
    - All planning docs updated to reference OpenAI
  affects:
    - src/utils/env.ts
    - src/services/aiService.ts
    - package.json
    - .env.example
    - CLAUDE.md
    - .planning/**/*.md
tech_stack:
  added:
    - "openai@4.104.0"
  patterns:
    - OpenAI SDK client.chat.completions.create with system message prepended to history array
    - In-memory conversation history with OpenAI.Chat.ChatCompletionMessageParam[]
    - npm install --legacy-peer-deps (openai v4 expects zod ^3, project uses zod ^4 directly)
key_files:
  created: []
  modified:
    - package.json
    - package-lock.json
    - src/utils/env.ts
    - src/services/aiService.ts
    - .env.example
    - CLAUDE.md
    - DIGISAC_IA_INTEGRATION.md
    - .planning/PROJECT.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
    - .planning/research/STACK.md
    - .planning/research/ARCHITECTURE.md
    - .planning/research/PITFALLS.md
    - .planning/research/SUMMARY.md
    - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-RESEARCH.md
    - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-CONTEXT.md
    - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-01-PLAN.md
    - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-01-SUMMARY.md
    - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-PATTERNS.md
decisions:
  - "openai v4 expects zod ^3 as peer dep but project uses zod ^4 directly — resolved with --legacy-peer-deps; no runtime conflict since openai SDK does not use our zod instance"
  - "Top-level system param not supported in openai v4 chat.completions.create — system message prepended to messages array as { role: system, content: env.SYSTEM_PROMPT }"
  - "openai v4 installed at 4.104.0 (latest matching ^4.98.0)"
metrics:
  duration: "18 minutes"
  completed: "2026-04-16"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 20
requirements: []
---

# Quick Task 260416-pjk: Swap AI Provider from Anthropic to OpenAI Summary

Full provider swap from Anthropic (@anthropic-ai/sdk + ANTHROPIC_API_KEY) to OpenAI (openai + OPENAI_API_KEY) across all code and planning documentation — aiService.ts now calls chat.completions.create returning choices[0].message.content, env.ts validates OPENAI_API_KEY with sk- prefix, and all .md files reference OpenAI/GPT-4o.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Swap SDK in package.json and install openai | 4275367 | package.json, package-lock.json |
| 2 | Update env.ts and aiService.ts for OpenAI | bd23959 | src/utils/env.ts, src/services/aiService.ts, .env.example |
| 3 | Update all .md planning docs to reference OpenAI | be59a81 | CLAUDE.md, DIGISAC_IA_INTEGRATION.md, 15 .planning/*.md files |

## Code Changes

### src/utils/env.ts
- Removed `ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-')`
- Removed `CLAUDE_MODEL: z.string().default('claude-sonnet-4-6')`
- Added `OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY must start with sk-')`
- Added `OPENAI_MODEL: z.string().default('gpt-4o')`

### src/services/aiService.ts
- Replaced Phase 1 stub with real OpenAI implementation
- Imports `OpenAI` from `openai`
- In-memory `Map<string, OpenAI.Chat.ChatCompletionMessageParam[]>` per contactId
- Trims history to last 20 messages before each API call
- Calls `client.chat.completions.create` with system message prepended to trimmed history
- Returns `response.choices[0]?.message?.content ?? ''`

### package.json
- Removed `@anthropic-ai/sdk: ^0.90.0`
- Added `openai: ^4.98.0`
- Installed at `openai@4.104.0` with `--legacy-peer-deps`

## Documentation Changes

All occurrences of the following were replaced across all listed .md files:

| Old | New |
|-----|-----|
| `@anthropic-ai/sdk` | `openai` |
| `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` |
| `CLAUDE_MODEL` | `OPENAI_MODEL` |
| `claude-sonnet-4-6` | `gpt-4o` |
| `Anthropic API` / `Claude API` | `OpenAI API` |
| `client.messages.create()` | `client.chat.completions.create()` |
| `sk-ant-` prefix note | `sk-` prefix note |
| Phase 4 Anthropic tier blocker | OpenAI rate limits blocker |

Files updated: CLAUDE.md, DIGISAC_IA_INTEGRATION.md, .planning/PROJECT.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md, .planning/STATE.md, .planning/research/STACK.md, .planning/research/ARCHITECTURE.md, .planning/research/PITFALLS.md, .planning/research/SUMMARY.md, 01-RESEARCH.md, 01-CONTEXT.md, 01-01-PLAN.md, 01-01-SUMMARY.md, 01-PATTERNS.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] openai v4 top-level `system` param not supported**
- **Found during:** Task 2
- **Issue:** The plan's action specified `system: env.SYSTEM_PROMPT` as a top-level field in `chat.completions.create`. Inspection of `node_modules/openai/resources/chat/completions/completions.d.ts` confirmed no top-level `system` field exists in `ChatCompletionCreateParams`. The plan itself included a NOTE for exactly this case.
- **Fix:** Prepended `{ role: 'system', content: env.SYSTEM_PROMPT }` to the `messages` array, as documented in the plan's fallback instruction.
- **Files modified:** `src/services/aiService.ts`
- **Commit:** bd23959

**2. [Rule 3 - Blocking] npm install peer dependency conflict (openai v4 expects zod ^3)**
- **Found during:** Task 1
- **Issue:** `openai@4.104.0` declares `peerOptional zod: ^3.23.8` but project has `zod@4.3.6`. npm refused to install with standard `npm install`.
- **Fix:** Used `npm install --legacy-peer-deps`. This is safe because the project uses zod independently of the openai SDK — the peer dependency is optional and our zod usage is only in env.ts, not through the openai SDK.
- **Files modified:** package-lock.json
- **Commit:** 4275367

**3. [Rule 2 - Missing] DIGISAC_IA_INTEGRATION.md not in plan's files_modified but contained stale references**
- **Found during:** Task 3 (verification grep)
- **Issue:** The grep verification revealed stale references in DIGISAC_IA_INTEGRATION.md which was not listed in the plan's `files_modified`. This file is the integration reference document and its stale references would confuse future developers.
- **Fix:** Updated all Anthropic/Claude references in DIGISAC_IA_INTEGRATION.md to OpenAI/GPT-4o.
- **Files modified:** DIGISAC_IA_INTEGRATION.md
- **Commit:** be59a81

## Verification Results

1. `npx tsc --noEmit` exits 0 — clean compilation
2. Stale references grep — CLEAN (no ANTHROPIC_API_KEY, @anthropic-ai/sdk, CLAUDE_MODEL, or claude-sonnet-4-6 outside this PLAN.md)
3. `node -e "import('openai').then(m => console.log('ok', typeof m.default))"` prints `ok function`
4. `.env.example` contains `OPENAI_API_KEY=` and `OPENAI_MODEL=gpt-4o`, no `ANTHROPIC_API_KEY`

## Threat Surface Scan

No new security surface introduced. The T-quick-01 mitigation (never log OPENAI_API_KEY) is satisfied — aiService.ts only logs `contactId` and `historyLength`, consistent with the threat model.

## Self-Check: PASSED

- src/utils/env.ts: FOUND
- src/services/aiService.ts: FOUND
- package.json has openai, no @anthropic-ai/sdk: VERIFIED
- .env.example has OPENAI_API_KEY=: VERIFIED
- All planning .md files clean from grep: VERIFIED
- Commits 4275367, bd23959, be59a81: FOUND in git log
