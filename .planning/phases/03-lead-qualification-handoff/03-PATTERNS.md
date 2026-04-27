# Phase 3: Lead Qualification + Handoff - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 5 new/modified files
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/services/handoffService.ts` | service | file-I/O + CRUD | `src/services/sessionService.ts` | exact — same singleton Map pattern with exported functions |
| `src/handlers/webhookHandler.ts` | handler | request-response | itself (modify) | n/a — integration points added inline |
| `src/utils/env.ts` | config | n/a | itself (modify) | n/a — three new Zod fields added |
| `src/server.ts` | config | n/a | itself (modify) | n/a — `await loadFromDisk()` added before `app.listen()` |
| `data/.gitignore` entry | config | n/a | existing `.gitignore` (if present) | n/a — one-line addition |

---

## Pattern Assignments

### `src/services/handoffService.ts` (service, file-I/O + CRUD)

**Analog:** `src/services/sessionService.ts`

**Imports pattern** (`src/services/sessionService.ts` lines 1–1, plus Node built-ins):
```typescript
import { writeFile, readFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
```
Note: sessionService.ts has no file I/O; the import pattern above reflects what handoffService.ts needs based on the stack already established in env.ts and logger.ts.

**Singleton Map pattern** (`src/services/sessionService.ts` lines 31–31):
```typescript
const sessions = new Map<string, SessionState>();
```
Mirror exactly for `pausedContacts`:
```typescript
const pausedContacts = new Map<string, PauseRecord>();
```

**Exported read function pattern** (`src/services/sessionService.ts` lines 39–51):
```typescript
export function getOrCreateSession(contactId: string): SessionState {
  let session = sessions.get(contactId);
  if (!session) {
    session = { ... };
    sessions.set(contactId, session);
  }
  return session;
}
```
For `isPaused`, simplify to a boolean Map check:
```typescript
export function isPaused(contactId: string): boolean {
  return pausedContacts.has(contactId);
}
```

**Logger child pattern** (`src/services/aiService.ts` lines 62–62, `src/services/complianceService.ts` lines 29–29):
```typescript
const log = logger.child({ contactId, service: 'compliance' });
log.info('...');
```
In `pause()`, use:
```typescript
logger.info({ contactId, reason }, 'contact paused — handoff triggered');
```

**Test-only reset helper pattern** (`src/services/sessionService.ts` lines 87–89):
```typescript
export function __resetSessionStoreForTesting(): void {
  sessions.clear();
}
```
Mirror for handoffService:
```typescript
export function __resetPausedContactsForTesting(): void {
  pausedContacts.clear();
}
```

**Atomic file write pattern** (RESEARCH.md Pattern 2 — no codebase analog; use this verbatim):
```typescript
async function saveToDisk(): Promise<void> {
  const filePath = path.resolve(env.PAUSED_STATE_FILE);
  const tmpPath = filePath + '.tmp';
  const data: Record<string, PauseRecord> = Object.fromEntries(pausedContacts);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}
```

**loadFromDisk error-handling pattern** (RESEARCH.md Pattern 5 — no codebase analog; use this verbatim):
```typescript
export async function loadFromDisk(): Promise<void> {
  const filePath = path.resolve(env.PAUSED_STATE_FILE);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, PauseRecord>;
    for (const [contactId, record] of Object.entries(parsed)) {
      pausedContacts.set(contactId, record);
    }
    logger.info({ count: pausedContacts.size }, 'paused contacts loaded from disk');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info('paused state file not found — starting with empty state');
    } else {
      logger.warn({ err }, 'paused state file unreadable — starting with empty state');
    }
  }
}
```

---

### `src/handlers/webhookHandler.ts` (handler, request-response — modify existing)

**Analog:** itself — two new insertion points within the existing guard chain.

**Guard structure pattern** (`src/handlers/webhookHandler.ts` lines 47–85):
```typescript
// Guard N: <description>
if (<condition>) {
  logger.debug({ messageId: msg.id }, 'discarded: <reason>');
  return;
}
```
Every new guard follows this exact same shape — condition check, one-liner log, bare `return`.

**Guard 6 — isPaused (HAND-05)** — insert immediately after line 95 (contactId null-check), before `getOrCreateSession()` at line 101:
```typescript
// Guard 6: paused contacts (HAND-05) — check BEFORE session touch
if (isPaused(contactId)) {
  log.info('discarded: contact is paused (handoff active)');
  return;
}
```
Critical: log uses the `log` child already bound to `contactId` at line 96. Guard must come after `contactId` is extracted AND the null-check (line 95) so that a missing contactId still hits the existing error path, not this guard.

**Guard 7 — urgency keyword detection (D-04, D-06)** — insert immediately after Guard 6, before `getOrCreateSession()`:
```typescript
// Guard 7: urgency keywords — bypass compliance, trigger immediate handoff (D-04, D-06)
if (isUrgencyKeyword(msg.text)) {
  log.info({ text: msg.text }, 'urgency keyword detected — triggering immediate handoff');
  await pause(contactId, 'urgency');
  await sendMessage(contactId, env.HANDOFF_MESSAGE);
  return;
}
```

**[HANDOFF] marker detection** — insert after `const aiReply = await getAIResponse(...)` at line 118, replacing the current single `sendMessage` call path:
```typescript
if (aiReply.includes('[HANDOFF]')) {
  const strippedText = aiReply.replaceAll('[HANDOFF]', '').trim();
  if (strippedText) {
    await sendMessage(contactId, appendDisclaimer(strippedText));
  }
  await pause(contactId, 'marker');
  await sendMessage(contactId, env.HANDOFF_MESSAGE);
  log.info({ reason: 'marker' }, 'handoff triggered by AI marker');
  return;
}
```
Use `replaceAll` not `replace` — see RESEARCH.md Pitfall 5.

**FallbackAlreadySent catch pattern** (`src/handlers/webhookHandler.ts` lines 121–126) — the existing sentinel-error catch block is the pattern to follow for any new early-return logic:
```typescript
} catch (err) {
  if (err instanceof FallbackAlreadySent) {
    log.info('429 fallback already delivered by aiService; skipping second send');
    return;
  }
  throw err;
}
```
No new sentinel error is needed for Phase 3 — handoff returns normally from the guard/marker block.

**isUrgencyKeyword helper** — module-level initialization pattern from RESEARCH.md Pattern 3; place near the top of the file alongside the existing `seenMessages` Map and `DEDUP_TTL_MS` constant:
```typescript
const urgencyKeywords: string[] = env.URGENCY_KEYWORDS
  .split(',')
  .map((k) => k.trim().toLowerCase())
  .filter(Boolean);

function isUrgencyKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return urgencyKeywords.some((kw) => lower.includes(kw));
}
```

---

### `src/utils/env.ts` (config — modify existing)

**Analog:** itself — three new optional fields added to the existing `EnvSchema` object.

**Optional string with default pattern** (`src/utils/env.ts` lines 19–24):
```typescript
OPENAI_FALLBACK_MESSAGE: z
  .string()
  .default(
    'No momento estou com dificuldades técnicas para responder. ' +
    'Um de nossos atendentes entrará em contato em breve.',
  ),
```
Copy this exact shape for each of the three new fields. Add them in the `// Server` block or create a new `// Handoff` block comment for grouping:
```typescript
// Handoff (Phase 3)
URGENCY_KEYWORDS: z
  .string()
  .default('preso,liminar,audiência amanhã,habeas corpus,flagrante'),

HANDOFF_MESSAGE: z
  .string()
  .default(
    'Um de nossos advogados irá dar continuidade ao seu atendimento em breve. Obrigado pela paciência.',
  ),

PAUSED_STATE_FILE: z
  .string()
  .default('./data/paused.json'),
```

---

### `src/server.ts` (config — modify existing)

**Analog:** itself — `await loadFromDisk()` inserted before `app.listen()`.

**Current synchronous startup pattern** (`src/server.ts` lines 47–49):
```typescript
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started');
});
```

**Modified async startup pattern** — the project already uses `"type": "module"` (ESM), so top-level `await` is valid. Add the import and the `await` call immediately before the `app.listen` call:
```typescript
import { loadFromDisk } from './services/handoffService.js';

// ... existing middleware setup (unchanged) ...

await loadFromDisk(); // must resolve before accepting connections (RESEARCH.md Pitfall 6)
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started');
});
```
The `.js` extension on the import is mandatory — all existing service imports in server.ts use `.js` (e.g., `import router from './routes/index.js'`).

---

## Shared Patterns

### Singleton Module-Level Map
**Source:** `src/services/sessionService.ts` lines 31–51
**Apply to:** `handoffService.ts`

The entire module structure follows the same pattern: unexported module-level `Map`, exported functions that operate on it, no class, no constructor. `handoffService.ts` is a direct structural mirror of `sessionService.ts`, adding only file I/O in `loadFromDisk`/`saveToDisk`.

```typescript
// Unexported singleton
const <storeName> = new Map<string, <RecordType>>();

// Exported operations
export function <read>(key: string): <ReturnType> { ... }
export async function <write>(key: string, ...): Promise<void> { ... }
export async function loadFromDisk(): Promise<void> { ... }

// Test helper
export function __reset<StoreName>ForTesting(): void {
  <storeName>.clear();
}
```

### Logger Child with contactId
**Source:** `src/services/aiService.ts` line 62; `src/services/complianceService.ts` line 29; `src/handlers/webhookHandler.ts` line 96
**Apply to:** `handoffService.ts` (in `pause()`), `webhookHandler.ts` new guard/marker blocks

```typescript
const log = logger.child({ contactId });
log.info({ reason }, 'event description');
```
In `handoffService.ts`, use the root `logger` directly (no request context), passing `contactId` as a structured field:
```typescript
logger.info({ contactId, reason }, 'contact paused — handoff triggered');
```
In `webhookHandler.ts`, the `log` child is already bound at line 96 — use `log`, not `logger`, inside any code after that line.

### Env Var Import
**Source:** `src/services/aiService.ts` line 3; `src/services/complianceService.ts` line 1; `src/services/digisacService.ts` line 15
**Apply to:** `handoffService.ts`

```typescript
import { env } from '../utils/env.js';
```
Always import from `'../utils/env.js'` (with `.js` extension — NodeNext ESM requirement). Never read `process.env` directly in a service.

### Bare `return` Guards (No Response)
**Source:** `src/handlers/webhookHandler.ts` lines 48–85
**Apply to:** Guard 6 and Guard 7 additions in `webhookHandler.ts`

Every guard is a one-liner: `if (condition) { log.X(...); return; }`. No `next()`, no `res.send()`, no thrown errors — the HTTP 200 is already sent upstream before this function is called.

### `.js` Extension on All Local Imports
**Source:** Every file in `src/` — e.g., `src/handlers/webhookHandler.ts` line 1
**Apply to:** `handoffService.ts` import declarations

```typescript
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
```
TypeScript NodeNext resolution requires `.js` extensions on all relative imports even though the source files are `.ts`.

---

## No Analog Found

No files fall into this category. All five files in scope have direct analogs or are self-modifications of existing files.

---

## Metadata

**Analog search scope:** `/home/rodrigo/botLP/src/` — all 10 `.ts` files
**Files scanned:** 10 source files read in full
**Pattern extraction date:** 2026-04-17
