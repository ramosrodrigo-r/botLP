---
phase: 01-webhook-infrastructure-compliance-foundation
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - .env.example
  - .gitignore
  - package.json
  - src/handlers/webhookHandler.ts
  - src/routes/index.ts
  - src/server.ts
  - src/services/aiService.ts
  - src/services/complianceService.ts
  - src/services/digisacService.ts
  - src/types/digisac.ts
  - src/utils/env.ts
  - src/utils/logger.ts
  - tsconfig.json
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-16
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The Phase 1 infrastructure is structurally sound: webhook authentication uses `crypto.timingSafeEqual`, the fire-and-forget pattern correctly separates HTTP response from async processing, rate limiting and security headers are applied, env validation fails fast at startup, and the compliance flow (disclosure + LGPD consent) is logically correct.

One critical issue stands out: the codebase uses the **OpenAI SDK** (`openai` package) instead of the **Anthropic SDK** (`@anthropic-ai/sdk`) specified in `CLAUDE.md`. This is a requirements deviation that affects `package.json`, `src/services/aiService.ts`, `src/utils/env.ts`, and `.env.example`. The AI service is currently dormant (Phase 2 wires it in) so this does not break Phase 1 runtime behavior, but it must be corrected before the AI pipeline is activated.

Three warnings cover: a state-integrity gap in the compliance flow when the second message send fails; unbounded history mutation before API call success; and a silent empty-reply scenario. Three info items cover: the `histories.set` redundant call pattern, the graceful shutdown gap with in-flight `setImmediate` callbacks, and a fragile SDK require workaround.

---

## Critical Issues

### CR-01: OpenAI SDK Used Instead of Anthropic SDK (CLAUDE.md Violation)

**Files:**
- `package.json:21`
- `src/services/aiService.ts:1,5,9,23`
- `src/utils/env.ts:17-18`
- `.env.example:9-10`

**Issue:** `CLAUDE.md` explicitly specifies `@anthropic-ai/sdk ^0.90.0` and the `client.messages.create()` API. The implementation instead depends on the `openai` npm package (v4.98.0), uses `OpenAI.Chat.ChatCompletionMessageParam[]`, and calls `client.chat.completions.create()`. The env schema validates `OPENAI_API_KEY` and `OPENAI_MODEL`, and `.env.example` documents OpenAI keys. This is a full-stack substitution that contradicts the project's stated dependency and API contract.

**Fix:** Replace the `openai` dependency with `@anthropic-ai/sdk ^0.90.0` and rewrite `aiService.ts` to use the Anthropic messages API:

```typescript
// package.json — replace:
//   "openai": "^4.98.0"
// with:
//   "@anthropic-ai/sdk": "^0.90.0"

// src/services/aiService.ts
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const histories = new Map<string, Anthropic.Messages.MessageParam[]>();

export async function getAIResponse(
  contactId: string,
  userMessage: string,
): Promise<string> {
  const history = histories.get(contactId) ?? [];
  const trimmed = history.slice(-20);
  trimmed.push({ role: 'user', content: userMessage });

  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: env.SYSTEM_PROMPT,
    messages: trimmed,
  });

  const assistantText =
    response.content[0]?.type === 'text' ? response.content[0].text : '';

  const updated = [...trimmed, { role: 'assistant' as const, content: assistantText }];
  histories.set(contactId, updated);

  return assistantText;
}
```

Also rename `OPENAI_API_KEY` → `ANTHROPIC_API_KEY` and `OPENAI_MODEL` → `ANTHROPIC_MODEL` in `env.ts` and `.env.example`, adjusting the `startsWith` validator appropriately (`sk-ant-api`).

---

## Warnings

### WR-01: Compliance State Partially Updated When Second Send Fails

**File:** `src/services/complianceService.ts:52-54`

**Issue:** `state.disclosureSent = true` is set only after both `sendMessage` calls. If the first `sendMessage` (disclosure) succeeds but the second (`LGPD_CONSENT_MESSAGE`) throws, `disclosureSent` remains `false`. On the next inbound message the contact receives the disclosure message a second time — a confusing duplicate. Worse, the LGPD consent prompt was never delivered, so the user never saw it before their next message is treated as implicit consent on the subsequent call.

```typescript
// Current — disclosure sent, state updated only if both succeed:
await sendMessage(contactId, env.DISCLOSURE_MESSAGE);
await sendMessage(contactId, env.LGPD_CONSENT_MESSAGE);
state.disclosureSent = true;
```

**Fix:** Set `disclosureSent = true` after the first send succeeds, and use a separate `consentPromptSent` flag (or at minimum move the flag assignment before the second call):

```typescript
await sendMessage(contactId, env.DISCLOSURE_MESSAGE);
state.disclosureSent = true;               // mark before second call
await sendMessage(contactId, env.LGPD_CONSENT_MESSAGE);
// consentGiven remains false — next reply = implicit consent
```

This ensures a partial failure is idempotent on retry rather than re-sending the disclosure message.

### WR-02: User Message Pushed to History Before API Call Succeeds

**File:** `src/services/aiService.ts:16-29`

**Issue:** The user message is pushed to `history` (line 16) before the API call on line 23. If `client.chat.completions.create()` throws (network error, rate limit, API error), the user message is permanently recorded in the history without a corresponding assistant response. On the next call the AI will see the message twice (once from the failed attempt, once re-submitted), which can cause confused or duplicated responses.

```typescript
// Current:
const history = histories.get(contactId) ?? [];
history.push({ role: 'user', content: userMessage });  // line 16 — mutates before API call
const trimmed = history.slice(-20);
const response = await client.chat.completions.create({ ... }); // may throw
```

**Fix:** Build the trimmed array without mutating stored history first; only commit to `histories` after the full exchange succeeds:

```typescript
const history = histories.get(contactId) ?? [];
const trimmed = [...history.slice(-20), { role: 'user' as const, content: userMessage }];
const response = await client.chat.completions.create({
  model: env.OPENAI_MODEL,
  messages: [{ role: 'system', content: env.SYSTEM_PROMPT }, ...trimmed],
});
const assistantText = response.choices[0]?.message?.content ?? '';
histories.set(contactId, [...trimmed, { role: 'assistant', content: assistantText }]);
return assistantText;
```

### WR-03: Empty String Returned and Stored When AI Returns No Content

**File:** `src/services/aiService.ts:28-29`

**Issue:** `response.choices[0]?.message?.content ?? ''` falls back to `''` when the API returns a null content or no choices. The empty string is then pushed to history and returned to the caller. The compliance service (Phase 2 integration) would send an empty message to the lead, and future AI calls will have an empty assistant turn in context that may confuse the model.

```typescript
const assistantText = response.choices[0]?.message?.content ?? '';  // silent empty fallback
history.push({ role: 'assistant', content: assistantText });         // empty string stored
```

**Fix:** Throw an explicit error when the response has no usable content, so the top-level `.catch` handler logs it and no message is sent to the lead:

```typescript
const assistantText = response.choices[0]?.message?.content;
if (!assistantText) {
  throw new Error(`AI returned empty content for contactId=${contactId}`);
}
```

---

## Info

### IN-01: `histories.set` Is Redundant on Non-First Calls

**File:** `src/services/aiService.ts:30`

**Issue:** On all calls after the first, `history` is the same array reference already stored in `histories`. Calling `histories.set(contactId, history)` re-sets the same reference. This is harmless but signals an intent mismatch — the code appears to need the set every time, but it only matters on first call. The pattern also becomes incorrect if WR-02 is fixed (where a new array should be stored).

**Fix:** Once WR-02 is addressed, the store update becomes a deliberate `histories.set(contactId, updatedArray)`, making this pattern unambiguous. No action needed in isolation, but address alongside WR-02.

### IN-02: Graceful Shutdown Does Not Drain In-Flight setImmediate Callbacks

**File:** `src/server.ts:52-57`

**Issue:** On `SIGTERM`/`SIGINT`, `server.close()` stops accepting new connections but does not wait for `setImmediate` callbacks dispatched from active request handlers to complete. A webhook that has already been acknowledged (HTTP 200 sent) but whose `handleWebhookAsync` is still running will be abandoned mid-flight — potentially leaving a contact in `disclosureSent=true` state without the LGPD consent message having been sent.

This is an acceptable v1 trade-off given Railway's graceful shutdown window, but is worth documenting as a known gap for Phase 3 (handoff state persistence).

**Fix (optional for v1):** Track active async jobs with a simple counter and delay `process.exit` until the counter reaches zero or a timeout elapses:

```typescript
// Minimal in-flight tracker — add to webhookHandler module:
let activeJobs = 0;
export function incrementJobs() { activeJobs++; }
export function decrementJobs() { activeJobs--; }

// In shutdown handler:
server.close(() => {
  const deadline = Date.now() + 5000;
  const poll = () => {
    if (activeJobs === 0 || Date.now() > deadline) return process.exit(0);
    setTimeout(poll, 100);
  };
  poll();
});
```

### IN-03: SDK `createRequire` Workaround Is Fragile Against SDK Updates

**File:** `src/services/digisacService.ts:42-44`

**Issue:** `_require('@ikatec/digisac-api-sdk/apis')` hard-codes an internal sub-path of the SDK (`/apis`). This path is not documented as a public API contract of the package. A patch update to `@ikatec/digisac-api-sdk` that renames or moves `apis/index.js` will cause a runtime `MODULE_NOT_FOUND` error with no TypeScript-compile-time warning.

**Fix:** Pin the SDK to an exact version in `package.json` (change `^2.1.1` to `2.1.1`) to prevent automatic patch updates from silently breaking the require path. When upgrading, manually verify the internal path still exists:

```json
"@ikatec/digisac-api-sdk": "2.1.1"
```

Also consider adding a startup sanity check:

```typescript
// After _require calls, verify the constructors are functions:
if (typeof BaseApiClient !== 'function' || typeof MessagesApi !== 'function') {
  throw new Error('Digisac SDK internal path changed — update digisacService.ts');
}
```

---

_Reviewed: 2026-04-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
