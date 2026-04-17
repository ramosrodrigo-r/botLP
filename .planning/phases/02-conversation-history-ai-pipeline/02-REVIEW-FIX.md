---
phase: 02-conversation-history-ai-pipeline
fixed_at: 2026-04-16T00:00:00Z
review_path: .planning/phases/02-conversation-history-ai-pipeline/02-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-04-16T00:00:00Z
**Source review:** .planning/phases/02-conversation-history-ai-pipeline/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, CR-02, WR-01, WR-02, WR-03)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: `msg.contactId` Is Undefined at Runtime — All Contacts Share One Session

**Files modified:** `src/handlers/webhookHandler.ts`
**Commit:** a81a9b6
**Applied fix:** Changed import from `@ikatec/digisac-api-sdk/incommingWebhooks` to `../types/digisac.js` for consistency. Extracted `contactId` via `(msg as Record<string, unknown>)['contactId'] as string | undefined` — acknowledging that the SDK's `Message` type has no `contactId` field but Digisac sends it as an undeclared extra field on the flat payload. Added an early return with `logger.error` if `contactId` is missing, preventing the `"undefined"` key from routing all contacts to a shared session.

---

### CR-02: Empty OpenAI `content` Sends a Disclaimer-Only Message to Lead

**Files modified:** `src/services/aiService.ts`
**Commit:** c6c582b
**Applied fix:** Replaced `?? ''` nullish coalescing with an explicit `rawContent` null-check. When `rawContent` is falsy, logs a warning with `finish_reason`, sends `env.OPENAI_FALLBACK_MESSAGE` directly, and throws `FallbackAlreadySent` — reusing the existing sentinel so no history mutation occurs and no disclaimer-only message is delivered.

---

### WR-01: `lastAccessAt` Not Updated During Compliance-Only Interactions

**Files modified:** `src/handlers/webhookHandler.ts`
**Commit:** dc0f615
**Applied fix:** Added `import { getOrCreateSession } from '../services/sessionService.js'` and inserted a `session.lastAccessAt = Date.now()` touch after `contactId` is confirmed and before `runComplianceFlow`. This advances the TTL clock on every inbound message, preventing mid-onboarding TTL expiry for contacts who take more than 24 hours to reply to the consent prompt.

---

### WR-02: `appendDisclaimer` Hardcodes the Warning Emoji Separate from the Env Var

**Files modified:** `src/services/complianceService.ts`, `.env.example`
**Commit:** 2bfa214
**Applied fix:** Removed the hardcoded `⚠️ ` prefix from `appendDisclaimer` — the function now formats as `` `${text}\n\n---\n${env.LEGAL_DISCLAIMER}` ``. Updated `.env.example` to include `⚠️` at the start of the `LEGAL_DISCLAIMER` value so the default output is unchanged. Updated the JSDoc to document that the full footer (including any emoji) should be in the env var.

---

### WR-03: `msg.text` Not Guarded for Empty String Before AI Call

**Files modified:** `src/handlers/webhookHandler.ts`
**Commit:** 7e99cc0
**Applied fix:** Added Guard 5 after `recordSeen(msg.id)` and before `contactId` extraction: `if (!msg.text.trim())` returns early with a `debug` log. This prevents empty user turns from being sent to OpenAI and prevents vacuous `{ role: 'user', content: '' }` history entries.

---

_Fixed: 2026-04-16T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
