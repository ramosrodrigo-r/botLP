---
phase: quick-260416-pjk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - src/utils/env.ts
  - src/services/aiService.ts
  - .env.example
  - CLAUDE.md
  - .planning/PROJECT.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - .planning/research/STACK.md
  - .planning/research/ARCHITECTURE.md
  - .planning/research/FEATURES.md
  - .planning/research/PITFALLS.md
  - .planning/research/SUMMARY.md
  - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-RESEARCH.md
  - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-CONTEXT.md
  - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-01-PLAN.md
  - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-01-SUMMARY.md
  - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-02-PLAN.md
  - .planning/phases/01-webhook-infrastructure-compliance-foundation/01-03-PLAN.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "Server starts without error after env swap (OPENAI_API_KEY present, ANTHROPIC_API_KEY absent)"
    - "aiService.ts calls openai SDK chat.completions.create and returns choices[0].message.content"
    - "env.ts validates OPENAI_API_KEY with sk- prefix check, no reference to ANTHROPIC_API_KEY"
    - "package.json has openai dependency, no @anthropic-ai/sdk"
    - "All .md planning docs reference OpenAI instead of Anthropic/Claude"
  artifacts:
    - path: "src/utils/env.ts"
      provides: "OPENAI_API_KEY + OPENAI_MODEL Zod fields, no ANTHROPIC_API_KEY"
    - path: "src/services/aiService.ts"
      provides: "openai SDK integration with chat.completions.create"
    - path: "package.json"
      provides: "openai dependency, @anthropic-ai/sdk removed"
    - path: ".env.example"
      provides: "OPENAI_API_KEY and OPENAI_MODEL entries"
  key_links:
    - from: "src/utils/env.ts"
      to: "src/services/aiService.ts"
      via: "env.OPENAI_API_KEY and env.OPENAI_MODEL consumed"
      pattern: "env\\.OPENAI"
---

<objective>
Replace the Anthropic/Claude AI provider with OpenAI across the entire codebase and all planning documentation.

Purpose: The project is switching AI providers from Anthropic (@anthropic-ai/sdk + ANTHROPIC_API_KEY) to OpenAI (openai + OPENAI_API_KEY) before Phase 2 AI implementation begins.

Output: Updated package.json, env.ts, aiService.ts, .env.example, CLAUDE.md, and all .planning/*.md files — no remaining Anthropic references in any code or docs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Swap SDK in package.json and install openai</name>
  <files>package.json</files>
  <action>
    1. In package.json `dependencies`, remove `"@anthropic-ai/sdk": "^0.90.0"` and add `"openai": "^4.98.0"` (latest stable v4 as of 2026-04).
    2. Run `npm install` to update package-lock.json and node_modules.
    3. Confirm `node_modules/openai` exists and `node_modules/@anthropic-ai` is gone.

    Do NOT touch any other dependency. Do NOT add `axios` or any other HTTP client.
  </action>
  <verify>
    <automated>node -e "import('openai').then(m => console.log('openai ok', typeof m.OpenAI))"</automated>
  </verify>
  <done>package.json lists `openai` in dependencies, `@anthropic-ai/sdk` is absent, `npm install` exits 0</done>
</task>

<task type="auto">
  <name>Task 2: Update env.ts and aiService.ts for OpenAI</name>
  <files>src/utils/env.ts, src/services/aiService.ts, .env.example</files>
  <action>
    **src/utils/env.ts:**
    - Remove the `ANTHROPIC_API_KEY` field (the one with `startsWith('sk-ant-')` check).
    - Remove the `CLAUDE_MODEL` field.
    - Add in their place:
      ```ts
      OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY must start with sk-'),
      OPENAI_MODEL: z.string().default('gpt-4o'),
      ```
    - Keep all other fields (Digisac, compliance texts, PORT, NODE_ENV) unchanged.
    - Update the comment above the new fields from `// Anthropic (...)` to `// OpenAI`.

    **src/services/aiService.ts:**
    - Replace the stub body with a real OpenAI implementation:
      ```ts
      import OpenAI from 'openai';
      import { env } from '../utils/env.js';
      import { logger } from '../utils/logger.js';

      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

      // In-memory conversation history keyed by contactId.
      // Trimmed to last 20 messages before each API call (10 exchanges).
      const histories = new Map<string, OpenAI.Chat.ChatCompletionMessageParam[]>();

      export async function getAIResponse(
        contactId: string,
        userMessage: string,
      ): Promise<string> {
        const history = histories.get(contactId) ?? [];
        history.push({ role: 'user', content: userMessage });

        // Trim to last 20 messages to control token cost
        const trimmed = history.slice(-20);

        logger.debug({ contactId, historyLength: trimmed.length }, 'Calling OpenAI chat.completions.create');

        const response = await client.chat.completions.create({
          model: env.OPENAI_MODEL,
          system: env.SYSTEM_PROMPT,
          messages: trimmed,
        });

        const assistantText = response.choices[0]?.message?.content ?? '';
        history.push({ role: 'assistant', content: assistantText });
        histories.set(contactId, history);

        return assistantText;
      }
      ```
    - NOTE: The `system` field in `chat.completions.create` is the top-level system param introduced in OpenAI v4 API. If the openai SDK version installed does not support the top-level `system` param, use the standard `messages` array approach instead: prepend `{ role: 'system', content: env.SYSTEM_PROMPT }` to `trimmed` before the API call and remove the standalone `system:` field.
    - Do NOT import or reference `@anthropic-ai/sdk` anywhere.
    - Do NOT change the function signature `getAIResponse(contactId, userMessage): Promise<string>` — it is consumed by other services.

    **.env.example:**
    - Replace the `# Anthropic` block:
      ```
      # Anthropic
      ANTHROPIC_API_KEY=
      CLAUDE_MODEL=claude-sonnet-4-6
      ```
      with:
      ```
      # OpenAI
      OPENAI_API_KEY=
      OPENAI_MODEL=gpt-4o
      ```
    - Leave all other lines unchanged.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>`npx tsc --noEmit` exits 0 with no errors; env.ts exports OPENAI_API_KEY and OPENAI_MODEL; aiService.ts imports from 'openai' and returns `choices[0].message.content`</done>
</task>

<task type="auto">
  <name>Task 3: Update all .md planning docs to reference OpenAI</name>
  <files>
    CLAUDE.md,
    .planning/PROJECT.md,
    .planning/ROADMAP.md,
    .planning/REQUIREMENTS.md,
    .planning/research/STACK.md,
    .planning/research/ARCHITECTURE.md,
    .planning/research/FEATURES.md,
    .planning/research/PITFALLS.md,
    .planning/research/SUMMARY.md,
    .planning/phases/01-webhook-infrastructure-compliance-foundation/01-RESEARCH.md,
    .planning/phases/01-webhook-infrastructure-compliance-foundation/01-CONTEXT.md,
    .planning/phases/01-webhook-infrastructure-compliance-foundation/01-01-PLAN.md,
    .planning/phases/01-webhook-infrastructure-compliance-foundation/01-01-SUMMARY.md,
    .planning/phases/01-webhook-infrastructure-compliance-foundation/01-02-PLAN.md,
    .planning/phases/01-webhook-infrastructure-compliance-foundation/01-03-PLAN.md
  </files>
  <action>
    For each file listed, apply these textual replacements (case-sensitive where noted):

    | Find | Replace |
    |------|---------|
    | `@anthropic-ai/sdk` | `openai` |
    | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` |
    | `CLAUDE_MODEL` | `OPENAI_MODEL` |
    | `claude-sonnet-4-6` | `gpt-4o` |
    | `Anthropic API` | `OpenAI API` |
    | `Anthropic SDK` | `OpenAI SDK` |
    | `client.messages.create()` | `client.chat.completions.create()` |
    | `# Anthropic account tier` blocker in STATE.md references | update to `# OpenAI account tier` |
    | `sk-ant-` (prefix note in docs) | `sk-` |
    | Stack table rows that mention `@anthropic-ai/sdk` | update package name to `openai` and update purpose/why columns accordingly |
    | `Claude` when referring to the AI model (e.g. "Claude API", "calls Claude") | `OpenAI` or `GPT-4o` as appropriate contextually |

    Preserve:
    - `CLAUDE.md` as the filename — do NOT rename the file.
    - Any occurrence of "Claude" that refers to the AI assistant persona named Claude (e.g., in CLAUDE.md project instructions section headers that say "Claude's Discretion" or "Claude executors") — these are GSD workflow references, not provider references. Only replace provider-related occurrences.
    - All Digisac-related content.
    - All compliance/legal text content.
    - File structure, headings, and formatting.

    Read each file first, then write the updated version. Do not batch-replace blindly — review each occurrence to ensure correctness of context before replacing.

    Also update STATE.md blocker:
    - Change: `Phase 4: Anthropic account tier unknown — if Tier 1, upgrade to Tier 2 ($40 deposit) required before any production traffic`
    - To: `Phase 4: OpenAI account tier / rate limits unknown — verify usage limits before any production traffic`
  </action>
  <verify>
    <automated>grep -r "ANTHROPIC_API_KEY\|@anthropic-ai/sdk\|CLAUDE_MODEL\|claude-sonnet-4-6" /home/rodrigo/botLP --include="*.md" --include="*.ts" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | grep -v "260416-pjk-PLAN.md" || echo "CLEAN — no stale Anthropic references found"</automated>
  </verify>
  <done>The grep above returns only the PLAN.md itself (self-referential) or outputs "CLEAN". All other files use OPENAI_API_KEY, openai, OPENAI_MODEL, gpt-4o. `npx tsc --noEmit` still exits 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| env → process | OPENAI_API_KEY is a secret read from environment; must never be logged or exposed in responses |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | aiService.ts | mitigate | Never log `env.OPENAI_API_KEY`; only log `contactId` and `historyLength` — confirmed in task 2 action |
| T-quick-02 | Tampering | .env.example | accept | `.env.example` contains no real secrets by design; reviewed in task 2 |
</threat_model>

<verification>
After all three tasks complete:

1. `npx tsc --noEmit` exits 0 (no type errors)
2. The grep command in Task 3 verify returns CLEAN (no stale Anthropic refs outside this PLAN.md)
3. `node -e "import('openai').then(m => console.log('ok', typeof m.OpenAI))"` prints `ok function`
4. `.env.example` contains `OPENAI_API_KEY=` and `OPENAI_MODEL=gpt-4o`, no `ANTHROPIC_API_KEY`
</verification>

<success_criteria>
- package.json: `openai` in dependencies, `@anthropic-ai/sdk` absent
- src/utils/env.ts: exports `OPENAI_API_KEY` (startsWith `sk-`) and `OPENAI_MODEL` (default `gpt-4o`)
- src/services/aiService.ts: imports `OpenAI` from `openai`, calls `chat.completions.create`, returns `choices[0].message.content`
- .env.example: has `OPENAI_API_KEY=` and `OPENAI_MODEL=gpt-4o`
- All .md planning files: no `ANTHROPIC_API_KEY`, no `@anthropic-ai/sdk`, no `CLAUDE_MODEL`, no `claude-sonnet-4-6`
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/260416-pjk-swap-ai-provider-from-anthropic-to-opena/260416-pjk-SUMMARY.md`
</output>
