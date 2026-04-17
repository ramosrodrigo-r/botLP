# Phase 2: Conversation History + AI Pipeline - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 5
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/services/aiService.ts` | service (modify) | request-response + state | `src/services/complianceService.ts` | role-match (same in-memory state pattern) |
| `src/services/sessionService.ts` | service (new, optional) | state management | `src/services/complianceService.ts` | role-match (Map + getOrCreate + reset pattern) |
| `src/services/complianceService.ts` | service (modify) | request-response | `src/services/complianceService.ts` | self (modify to consume SessionState instead of own Map) |
| `src/handlers/webhookHandler.ts` | handler (modify) | event-driven | `src/handlers/webhookHandler.ts` | self (wire AI pipeline at marked comment) |
| `src/utils/env.ts` | utility/config (modify) | config | `src/utils/env.ts` | self (add one optional Zod field) |

---

## Pattern Assignments

### `src/services/aiService.ts` (service, request-response + state)

**Analog:** `src/services/complianceService.ts`

**Imports pattern** (aiService.ts lines 1-5, complianceService.ts lines 1-3):
```typescript
// Current aiService.ts imports — keep these, add Mutex
import OpenAI from 'openai';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

// Add for mutex (new package — async-mutex):
import { Mutex } from 'async-mutex';

// Add if sessionService.ts is created (Option B):
// import { getOrCreateSession, resetSession, SessionState } from './sessionService.js';

// Add for 429 fallback send:
import { sendMessage } from './digisacService.js';
```

**In-memory Map + getOrCreate pattern** (analog: complianceService.ts lines 13-27):
```typescript
// complianceService.ts — the established Map + getOrCreate pattern to copy:
interface ComplianceState {
  disclosureSent: boolean;
  consentGiven: boolean;
}

const complianceStore = new Map<string, ComplianceState>();

function getState(contactId: string): ComplianceState {
  let state = complianceStore.get(contactId);
  if (!state) {
    state = { disclosureSent: false, consentGiven: false };
    complianceStore.set(contactId, state);
  }
  return state;
}
```

Apply this same pattern for `SessionState` in `aiService.ts` (or `sessionService.ts`):
```typescript
// Extend the existing histories Map into a unified SessionState Map:
interface SessionState {
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  consentGiven: boolean;
  disclosureSent: boolean;
  lastAccessAt: number; // epoch ms — Date.now()
}

const sessions = new Map<string, SessionState>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function getOrCreateSession(contactId: string): SessionState {
  let session = sessions.get(contactId);
  if (!session) {
    session = { history: [], consentGiven: false, disclosureSent: false, lastAccessAt: Date.now() };
    sessions.set(contactId, session);
  }
  return session;
}

export function resetSession(contactId: string): SessionState {
  const fresh: SessionState = {
    history: [],
    consentGiven: false,
    disclosureSent: false,
    lastAccessAt: Date.now(),
  };
  sessions.set(contactId, fresh);
  return fresh;
}
```

**Mutex Map pattern** (new — from RESEARCH.md Pattern 2):
```typescript
const mutexes = new Map<string, Mutex>();

// MUST be synchronous — no await inside; Node.js single-thread guarantees
// two concurrent callers both see the same Mutex instance from the Map.
function getMutex(contactId: string): Mutex {
  let mutex = mutexes.get(contactId);
  if (!mutex) {
    mutex = new Mutex();
    mutexes.set(contactId, mutex);
  }
  return mutex;
}
```

**Core getAIResponse pattern** (expanding aiService.ts lines 11-33):

Current skeleton to replace:
```typescript
// aiService.ts lines 11-33 (current — no mutex, no TTL, no 429 handling)
export async function getAIResponse(
  contactId: string,
  userMessage: string,
): Promise<string> {
  const history = histories.get(contactId) ?? [];
  history.push({ role: 'user', content: userMessage });
  const trimmed = history.slice(-20);
  logger.debug({ contactId, historyLength: trimmed.length }, 'Calling OpenAI chat.completions.create');
  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [{ role: 'system', content: env.SYSTEM_PROMPT }, ...trimmed],
  });
  const assistantText = response.choices[0]?.message?.content ?? '';
  history.push({ role: 'assistant', content: assistantText });
  histories.set(contactId, history);
  return assistantText;
}
```

Pattern to adopt — mutex wraps everything, TTL check at top, pendingHistory committed only on success:
```typescript
export async function getAIResponse(contactId: string, userMessage: string): Promise<string> {
  const log = logger.child({ contactId });
  const mutex = getMutex(contactId);
  const release = await mutex.acquire();

  try {
    // TTL lazy check (D-03/D-04)
    let session = getOrCreateSession(contactId);
    if (Date.now() - session.lastAccessAt > SESSION_TTL_MS) {
      log.info({ lastAccessAt: new Date(session.lastAccessAt).toISOString() }, 'session TTL expired — resetting');
      session = resetSession(contactId);
    }

    // pendingHistory — committed only on success (avoids Pitfall 2: history contamination on 429)
    const pendingHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...session.history,
      { role: 'user', content: userMessage },
    ];
    const trimmed = pendingHistory.slice(-20);
    log.debug({ historyLength: trimmed.length }, 'calling OpenAI');

    let assistantText: string;
    try {
      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [{ role: 'system', content: env.SYSTEM_PROMPT }, ...trimmed],
      });
      assistantText = response.choices[0]?.message?.content ?? '';
    } catch (err) {
      if (err instanceof OpenAI.RateLimitError) {
        // D-10/D-11: warn log + fallback message; do NOT touch session history or lastAccessAt
        log.warn(
          {
            openaiStatus: err.status,
            requestId: err.request_id ?? undefined,
            timestamp: new Date().toISOString(),
          },
          'OpenAI rate limit — sending fallback',
        );
        await sendMessage(contactId, env.OPENAI_FALLBACK_MESSAGE);
        return env.OPENAI_FALLBACK_MESSAGE;
      }
      throw err; // all other errors rethrow to setImmediate catch
    }

    // Commit only after success
    session.history = [...trimmed, { role: 'assistant', content: assistantText }];
    session.lastAccessAt = Date.now();

    return assistantText;
  } finally {
    release();
    // Lazy removal — consistent with dedup lazy eviction (D-09 Phase 1)
    if (!mutex.isLocked()) {
      mutexes.delete(contactId);
    }
  }
}
```

**Test-only reset helper pattern** (analog: complianceService.ts lines 87-89):
```typescript
// complianceService.ts lines 87-89 — copy this pattern for aiService/sessionService:
export function __resetComplianceStoreForTesting(): void {
  complianceStore.clear();
}

// Apply as:
export function __resetSessionStoreForTesting(): void {
  sessions.clear();
  mutexes.clear();
}
```

---

### `src/services/sessionService.ts` (service, state management — optional new file)

**Analog:** `src/services/complianceService.ts`

This file is only created if the planner chooses to extract `SessionState` from `aiService.ts` to avoid a circular import between `aiService.ts` and `complianceService.ts`. If all state stays in `aiService.ts` and `complianceService.ts` receives `session` as a parameter, this file is not needed.

**File structure pattern** (copy from complianceService.ts):
```typescript
// sessionService.ts — no external imports beyond standard utils
import OpenAI from 'openai';

export interface SessionState {
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  consentGiven: boolean;
  disclosureSent: boolean;
  lastAccessAt: number;
}

const sessions = new Map<string, SessionState>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function getOrCreateSession(contactId: string): SessionState { ... }
export function resetSession(contactId: string): SessionState { ... }
export function isSessionExpired(session: SessionState): boolean {
  return Date.now() - session.lastAccessAt > SESSION_TTL_MS;
}
export function __resetSessionStoreForTesting(): void { sessions.clear(); }
```

If this file exists, both `aiService.ts` and `complianceService.ts` import from it — eliminating any circular dependency risk.

---

### `src/services/complianceService.ts` (service, modify)

**Analog:** self — modify existing file

**Current internal Map to remove** (complianceService.ts lines 13-27):
```typescript
// REMOVE this internal Map and getState():
interface ComplianceState {
  disclosureSent: boolean;
  consentGiven: boolean;
}
const complianceStore = new Map<string, ComplianceState>();
function getState(contactId: string): ComplianceState { ... }
```

**Replacement: read/write from SessionState** — two acceptable approaches:

Option A — Session passed as parameter (keeps `webhookHandler.ts` in control):
```typescript
// complianceService.ts modified signature:
import type { SessionState } from './sessionService.js'; // or aiService.js

export async function runComplianceFlow(
  contactId: string,
  session: SessionState,
): Promise<boolean> {
  const log = logger.child({ contactId, service: 'compliance' });

  if (!session.disclosureSent) {
    log.info('new contact — sending AI disclosure and LGPD consent prompt');
    await sendMessage(contactId, env.DISCLOSURE_MESSAGE);
    await sendMessage(contactId, env.LGPD_CONSENT_MESSAGE);
    session.disclosureSent = true;
    return false;
  }

  if (!session.consentGiven) {
    session.consentGiven = true;
    log.info('implicit LGPD consent recorded');
    return true;
  }

  log.debug('compliance already satisfied; proceeding');
  return true;
}
```

Option B — complianceService imports from sessionService (cleaner caller):
```typescript
// complianceService.ts imports getOrCreateSession from sessionService:
import { getOrCreateSession } from './sessionService.js';

export async function runComplianceFlow(contactId: string): Promise<boolean> {
  const session = getOrCreateSession(contactId);
  // same logic reading/writing session.disclosureSent, session.consentGiven
}
```

**`appendDisclaimer` pattern** (complianceService.ts lines 79-81) — NO CHANGES:
```typescript
// complianceService.ts lines 79-81 — keep exactly as-is:
export function appendDisclaimer(text: string): string {
  return `${text}\n\n---\n⚠️ ${env.LEGAL_DISCLAIMER}`;
}
```

---

### `src/handlers/webhookHandler.ts` (handler, modify)

**Analog:** self — wire at the existing marked comment

**Logger child pattern** (webhookHandler.ts line 78) — already established, copy for AI context:
```typescript
// webhookHandler.ts line 78 — existing pattern:
const log = logger.child({ contactId, messageId: msg.id, event: payload.event });
```

**Existing wiring point** (webhookHandler.ts lines 90-93):
```typescript
// webhookHandler.ts lines 90-93 — REPLACE this block:
  // Phase 2: wire AI pipeline here.
  //   const aiReply = await getAIResponse(contactId, msg.text);
  //   await sendMessage(contactId, appendDisclaimer(aiReply));
  log.debug('compliance satisfied; Phase 2 AI pipeline would run here');
```

With:
```typescript
  // CONV-03/CONV-04: full AI pipeline
  const aiReply = await getAIResponse(contactId, msg.text);
  await sendMessage(contactId, appendDisclaimer(aiReply));
  log.info({ replyLength: aiReply.length }, 'AI reply sent to lead');
```

**Import additions** at top of webhookHandler.ts (after existing imports):
```typescript
// Add to existing imports in webhookHandler.ts lines 1-3:
import { getAIResponse } from '../services/aiService.js';
import { appendDisclaimer } from '../services/complianceService.js';
import { sendMessage } from '../services/digisacService.js';
```

Note: if Option A (session-as-parameter) is chosen for complianceService, `webhookHandler.ts` must also import `getOrCreateSession` and pass the session. If Option B, no change to the caller.

---

### `src/utils/env.ts` (utility/config, modify)

**Analog:** self — add one field using existing Zod pattern

**Existing optional-with-default pattern** (env.ts lines 18):
```typescript
// env.ts line 18 — copy this optional-with-default pattern:
OPENAI_MODEL: z.string().default('gpt-4o'),
```

**Addition to EnvSchema** (insert after `OPENAI_MODEL` line 18):
```typescript
// Add after OPENAI_MODEL in src/utils/env.ts:
OPENAI_FALLBACK_MESSAGE: z
  .string()
  .default(
    'No momento estou com dificuldades técnicas para responder. ' +
    'Um de nossos atendentes entrará em contato em breve.',
  ),
```

**Section comment pattern** (env.ts lines 10-16) — maintain grouping:
```typescript
// env.ts lines 10-18 — existing grouping with comments; add OPENAI_FALLBACK_MESSAGE
// inside the OpenAI group:
  // OpenAI (validated now even though AI pipeline is Phase 2 — fail-fast per OBS-02)
  OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY must start with sk-'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_FALLBACK_MESSAGE: z.string().default('...'),  // <-- add here
```

---

## Shared Patterns

### Logging: `logger.child({ contactId })` pattern
**Source:** `src/services/complianceService.ts` line 47, `src/services/digisacService.ts` line 65, `src/handlers/webhookHandler.ts` line 78
**Apply to:** All new/modified service functions that receive a `contactId`
```typescript
// complianceService.ts line 47 — the canonical form:
const log = logger.child({ contactId, service: 'compliance' });
// aiService.ts should use:
const log = logger.child({ contactId });
```

### Error propagation: throw unless specifically handled
**Source:** `src/handlers/webhookHandler.ts` (setImmediate catch context), `src/services/digisacService.ts` line 64 JSDoc
**Apply to:** `aiService.ts` — only catch `OpenAI.RateLimitError`; all other errors rethrow to the setImmediate top-level catch
```typescript
// digisacService.ts line 64 JSDoc — the established rethrow contract:
// "Throws on API error. Callers are responsible for catching — in the async
//  pipeline started from setImmediate the top-level .catch handler logs them."
```

### Lazy eviction without setInterval
**Source:** `src/handlers/webhookHandler.ts` lines 10-21 (dedup Map with lazy eviction)
**Apply to:** Mutex Map lazy removal in `aiService.ts` (after `release()`) and TTL check in `getAIResponse`
```typescript
// webhookHandler.ts lines 13-20 — the lazy eviction shape to mirror:
function isDuplicate(messageId: string): boolean {
  const seenAt = seenMessages.get(messageId);
  if (seenAt === undefined) return false;
  if (Date.now() - seenAt > DEDUP_TTL_MS) {
    seenMessages.delete(messageId); // lazy eviction
    return false;
  }
  return true;
}
```

### In-memory Map + getOrCreate helper
**Source:** `src/services/complianceService.ts` lines 18-27
**Apply to:** `SessionState` Map in `aiService.ts` or `sessionService.ts`
```typescript
// complianceService.ts lines 18-27 — canonical getOrCreate pattern:
const complianceStore = new Map<string, ComplianceState>();

function getState(contactId: string): ComplianceState {
  let state = complianceStore.get(contactId);
  if (!state) {
    state = { disclosureSent: false, consentGiven: false };
    complianceStore.set(contactId, state);
  }
  return state;
}
```

### Test-only reset export
**Source:** `src/services/complianceService.ts` lines 87-89
**Apply to:** `aiService.ts` or `sessionService.ts` — export a parallel `__resetSessionStoreForTesting()`
```typescript
// complianceService.ts lines 87-89:
export function __resetComplianceStoreForTesting(): void {
  complianceStore.clear();
}
```

### Module-level singleton clients
**Source:** `src/services/digisacService.ts` lines 50-51, `src/services/aiService.ts` line 5
**Apply to:** The OpenAI `client` in `aiService.ts` and both Maps (`sessions`, `mutexes`) stay module-level — never instantiate per-call
```typescript
// aiService.ts line 5 — existing singleton:
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
// digisacService.ts lines 50-51:
const apiClient = new BaseApiClient(env.DIGISAC_API_URL, env.DIGISAC_API_TOKEN);
const messagesApi = new MessagesApi(apiClient);
```

---

## No Analog Found

No files in this phase are entirely novel. All files either modify existing Phase 1 files or use patterns directly available in the codebase. The `async-mutex` library usage has no existing analog in the codebase but is fully specified in RESEARCH.md Pattern 2 with verified API details.

| File | Role | Data Flow | Note |
|------|------|-----------|------|
| `sessionService.ts` (if created) | service | state | No direct analog — but `complianceService.ts` Map pattern is a near-exact template; `async-mutex` usage is new but covered by RESEARCH.md Pattern 2 |

---

## Decision Aid for Planner

**`sessionService.ts` — create or not?**

- Create `sessionService.ts` if: `complianceService.ts` will import session state (Option B). This avoids a circular dependency since `aiService.ts` also imports `complianceService.ts` (for `appendDisclaimer`). Circular: `aiService → complianceService → aiService` if both import each other.
- Keep state in `aiService.ts` if: `complianceService.ts` receives `session` as a parameter (Option A), making `webhookHandler.ts` responsible for fetching the session and threading it through. No circular import, but `webhookHandler.ts` becomes more complex.
- **Recommendation:** Create `sessionService.ts`. Avoids circular import, keeps each file's responsibility clear, and aligns with the RESEARCH.md recommendation.

**`complianceService.ts` coordination — Option A vs Option B?**

- Option A (session as param): `runComplianceFlow(contactId, session)` — `webhookHandler.ts` calls `getOrCreateSession` and passes it; no import dependency from compliance to session.
- Option B (compliance imports sessionService): `runComplianceFlow(contactId)` — `complianceService.ts` fetches its own session; `webhookHandler.ts` stays simple.
- Both are valid. Option B is simpler for the caller. Option A is simpler for the dependency graph without `sessionService.ts`.

---

## Metadata

**Analog search scope:** `/home/rodrigo/botLP/src/` (all files — 9 total)
**Files scanned:** 9 (`server.ts`, `routes/index.ts`, `handlers/webhookHandler.ts`, `services/aiService.ts`, `services/complianceService.ts`, `services/digisacService.ts`, `types/digisac.ts`, `utils/env.ts`, `utils/logger.ts`)
**Pattern extraction date:** 2026-04-16
