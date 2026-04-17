---
phase: 02-conversation-history-ai-pipeline
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/services/sessionService.ts
  - src/services/complianceService.ts
  - src/utils/env.ts
  - .env.example
  - src/services/aiService.ts
  - src/handlers/webhookHandler.ts
  - package.json
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 2 introduces unified `SessionState`, per-contact mutex serialization, TTL expiry, OpenAI chat history management, and 429 fallback handling. The architecture is sound and the Pitfall 2 guard (no history mutation on failure) is correctly implemented.

Two critical bugs were found:

1. `msg.contactId` is accessed on the Digisac `Message` SDK type, which does not declare a `contactId` field. At runtime this is `undefined`, collapsing all contacts into a single shared session — a privacy and correctness failure.
2. An empty OpenAI completion response (`content: null`) produces a blank message delivered to the lead (disclaimer-only text).

Three warnings cover: the `lastAccessAt` clock not being refreshed during compliance-only interactions, the `appendDisclaimer` emoji being hardcoded rather than driven by the env var, and an unguarded `msg.text` empty-string path.

---

## Critical Issues

### CR-01: `msg.contactId` Is Undefined at Runtime — All Contacts Share One Session

**File:** `src/handlers/webhookHandler.ts:79`

**Issue:** The code reads `msg.contactId` where `msg` is typed as `Omit<Message, MessageRelationships>` (derived from `WebhookPayload<'message.created'>['data']`). Inspection of the SDK's published type definition confirms that the `Message` type has no `contactId` field — `contactId` only appears on `CreateMessagePayload`, `UpdateMessagePayload`, and `SendVcardsPayload`. Because `body` is cast as the un-narrowed `body as WebhookPayload` (no generic), TypeScript does not catch the invalid property access.

At runtime `msg.contactId` evaluates to `undefined`. Every call to `runComplianceFlow(contactId)` and `getAIResponse(contactId, msg.text)` uses `"undefined"` as the key. All leads share a single session, a single mutex, and a single conversation history — a privacy breach (one lead can see another's conversation context) and a correctness failure (compliance flags are shared across all contacts).

The Digisac `Message` type does expose `contact?: Contact` and `from?: Contact`, but these are stripped by `Omit<Message, MessageRelationships>`. The actual contact identifier available on the flat payload needs to be confirmed against the real Digisac API response shape (the SDK types may be incomplete). A safe fallback is to extract it from the raw body before casting.

**Fix:**

Option A — Use the narrowed generic payload type:

```typescript
// webhookHandler.ts — change the cast to use the typed helper from src/types/digisac.ts
import type { MessageCreatedPayload } from '../types/digisac.js';

// inside handleWebhookAsync:
const payload = body as MessageCreatedPayload; // narrows data to Omit<Message, MessageRelationships>
```

Then confirm what field carries the contact identifier by logging the raw body in development:

```typescript
// Temporary diagnostic — run once against real Digisac payload:
logger.debug({ msgKeys: Object.keys(msg) }, 'message field inventory');
```

Option B — if Digisac does send `contactId` as an undeclared extra field, read it safely:

```typescript
// Cast through unknown to acknowledge the field is not typed:
const contactId = (msg as Record<string, unknown>)['contactId'] as string | undefined;
if (!contactId) {
  log.error({ messageId: msg.id }, 'contactId missing from payload — cannot route session');
  return;
}
```

---

### CR-02: Empty OpenAI `content` Sends a Disclaimer-Only Message to Lead

**File:** `src/services/aiService.ts:95`

**Issue:** When `response.choices[0]?.message?.content` is `null` (which OpenAI returns when `finish_reason` is `tool_calls` or in rare API edge cases), the nullish coalescing `?? ''` sets `assistantText` to the empty string `''`. This empty string is:

1. Committed to `session.history` as `{ role: 'assistant', content: '' }` — polluting the history with a vacuous turn.
2. Returned to `webhookHandler.ts`, which calls `appendDisclaimer('')`, producing the string `"\n\n---\n⚠️ <disclaimer>"` and sending it to the lead — a blank message with only the legal footer.

This can occur with `gpt-4o` when the model unexpectedly returns an empty response.

**Fix:**

```typescript
// aiService.ts — after the try/catch around chat.completions.create:
const rawContent = response.choices[0]?.message?.content;
if (!rawContent) {
  log.warn(
    { finishReason: response.choices[0]?.finish_reason },
    'OpenAI returned empty content — sending fallback to lead',
  );
  await sendMessage(contactId, env.OPENAI_FALLBACK_MESSAGE);
  throw new FallbackAlreadySent();
}
const assistantText = rawContent;
```

This reuses the existing `FallbackAlreadySent` sentinel — no history mutation, no disclaimer-only delivery.

---

## Warnings

### WR-01: `lastAccessAt` Not Updated During Compliance-Only Interactions

**File:** `src/services/sessionService.ts:39-51` / `src/handlers/webhookHandler.ts:86-90`

**Issue:** `lastAccessAt` is only updated in two places: at `getOrCreateSession` (creation) and at line 116 of `aiService.ts` (after a successful OpenAI response). If a contact sends several messages during the disclosure/consent phase — which can span multiple turns — the clock does not advance. If more than 24 hours elapse between session creation and the first AI interaction, the TTL check in `aiService.ts` will reset the session even for an active user who is mid-onboarding.

This is a low-probability edge case (the compliance flow is typically two turns), but it causes the user to re-receive the disclosure and consent prompt unexpectedly.

**Fix:**

Update `lastAccessAt` whenever any inbound message is processed, not only after AI success. The cleanest place is `webhookHandler.ts`, after all guards pass:

```typescript
// webhookHandler.ts — after recordSeen(msg.id) and before runComplianceFlow:
const session = getOrCreateSession(contactId);
session.lastAccessAt = Date.now(); // touch TTL clock on any activity
```

Import `getOrCreateSession` from `sessionService.js` in the handler.

---

### WR-02: `appendDisclaimer` Hardcodes the Warning Emoji Separate from the Env Var

**File:** `src/services/complianceService.ts:62`

**Issue:** `appendDisclaimer` formats the separator and emoji inline:

```typescript
return `${text}\n\n---\n⚠️ ${env.LEGAL_DISCLAIMER}`;
```

The `⚠️` emoji is hardcoded and cannot be changed without a code deploy. The `LEGAL_DISCLAIMER` env var controls only the text after the emoji. If the escritório wants to adjust the format (remove the emoji, change the separator, or use a different symbol), they cannot do so via configuration. This also embeds an emoji into production output, which the project conventions discourage.

**Fix:**

Move the full disclaimer template to the env var or remove the hardcoded emoji and let `LEGAL_DISCLAIMER` include any desired prefix:

```typescript
// Simpler approach — let LEGAL_DISCLAIMER contain the full formatted footer:
export function appendDisclaimer(text: string): string {
  return `${text}\n\n---\n${env.LEGAL_DISCLAIMER}`;
}

// Then in .env.example, include the emoji in the value if desired:
// LEGAL_DISCLAIMER=⚠️ Este atendimento é meramente informativo...
```

---

### WR-03: `msg.text` Not Guarded for Empty String Before AI Call

**File:** `src/handlers/webhookHandler.ts:97`

**Issue:** `msg.text` is typed as `string` in the SDK (not `string | undefined`), but for non-payload chat messages it may arrive as an empty string `""`. Although the `type === 'chat'` guard (line 66) narrows to text messages, the WhatsApp platform occasionally delivers chat messages with no text body (e.g., forwarded contact cards mistyped, ephemeral messages, or corrupted delivery). Calling `getAIResponse(contactId, "")` sends an empty user turn to OpenAI — wasting tokens and recording a vacuous history entry `{ role: 'user', content: '' }`.

**Fix:**

```typescript
// webhookHandler.ts — after guard 4 (recordSeen), before runComplianceFlow:
if (!msg.text.trim()) {
  log.debug({ messageId: msg.id }, 'discarded: empty text body');
  return;
}
```

---

## Info

### IN-01: Duplicate Import Statements from the Same Module

**File:** `src/services/complianceService.ts:4-5`

**Issue:** `getOrCreateSession` and `__resetSessionStoreForTesting` are imported in two separate `import` statements from `'./sessionService.js'`. This should be a single combined import.

**Fix:**

```typescript
import {
  getOrCreateSession,
  __resetSessionStoreForTesting,
} from './sessionService.js';
```

---

### IN-02: `package.json` Test Script Still References Phase 1

**File:** `package.json:14`

**Issue:** `"test": "echo \"no tests in Phase 1\" && exit 0"` — the message references Phase 1 but the project is now in Phase 2. No tests exist for the new `sessionService`, `aiService`, or `complianceService` modules. Phase 2 introduces non-trivial logic (mutex serialization, TTL expiry, history trimming, 429 fallback sentinel) that benefits from unit tests. The stale message is a minor signal issue; the missing tests are the real concern.

**Fix:**

Update the message to reflect current state, and plan unit tests for `isSessionExpired`, `getOrCreateSession`, `getAIResponse` (mock OpenAI client), and `runComplianceFlow`.

---

### IN-03: `WebhookPayload` Cast Loses Type Narrowing in Handler

**File:** `src/handlers/webhookHandler.ts:44`

**Issue:** `body as WebhookPayload` (without the `<'message.created'>` generic) means `payload.data` is the union of all event data types across the entire `WebhookEventPayloadMap`. Properties like `msg.isFromMe`, `msg.type`, and `msg.text` are accessed without TypeScript verifying their presence. This is the root cause of CR-01 going undetected by the compiler.

The project already defines `MessageCreatedPayload` in `src/types/digisac.ts` for exactly this purpose.

**Fix:**

After confirming the event guard:

```typescript
// After guard 1 confirms event === 'message.created', re-cast to the narrow type:
import type { MessageCreatedPayload } from '../types/digisac.js';

// Replace the broad cast at line 44:
const payload = body as MessageCreatedPayload;
// Now payload.data is Omit<Message, MessageRelationships> — TypeScript catches bad field access.
```

---

_Reviewed: 2026-04-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
