# Phase 3: Lead Qualification + Handoff - Research

**Researched:** 2026-04-17
**Domain:** Node.js persistent state (fs/promises), guard chain extension, urgency detection, marker-based handoff
**Confidence:** HIGH

## Summary

Phase 3 adds three tightly scoped capabilities on top of the fully working Phase 2 pipeline: (1) urgency-keyword pre-screening that short-circuits the AI pipeline for emergency messages, (2) `[HANDOFF]` marker detection in AI replies that strips the marker, sends a handoff notification, and pauses the contact, and (3) a file-backed pause store that survives server restarts. All capabilities integrate at exactly two insertion points — the guard chain in `webhookHandler.ts` and the post-`getAIResponse()` block — without restructuring any Phase 1/2 logic.

The only new infrastructure is a single `handoffService.ts` module and a `data/paused.json` file. The in-memory `Map<string, PauseRecord>` acts as a read-cache; the file is the durable source of truth. Node.js built-in `fs/promises` (`writeFile` + `rename`) provides atomic writes with no extra dependencies. All env-var patterns, logging patterns, sentinel-error patterns, and lazy-eviction patterns from Phases 1 and 2 apply directly.

The urgency guard bypasses the LGPD compliance flow entirely (D-06): an emergency message from a lead who has not yet consented still receives the handoff notification immediately. This is an intentional product decision documented in CONTEXT.md.

**Primary recommendation:** Implement `handoffService.ts` as a singleton module with four methods (`pause`, `isPaused`, `loadFromDisk`, `saveToDisk`), loaded at server startup. Insert two integration points in `webhookHandler.ts`. Add three env vars to `env.ts` Zod schema. No new npm packages required.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Comportamento do texto [HANDOFF] (HAND-01, HAND-02, HAND-03)**

- **D-01:** Quando a IA retorna texto que contém `[HANDOFF]`: enviar o texto da IA (com disclaimer appendado) como primeira mensagem, depois enviar a notificação de handoff como segunda mensagem separada. O marcador `[HANDOFF]` é removido do texto antes de enviar.
- **D-02:** Detecção do marcador: checar se `aiReply` contém a string literal `[HANDOFF]`. Strip via `replace('[HANDOFF]', '').trim()`. Detecção em `webhookHandler.ts` após receber o retorno de `getAIResponse()`.
- **D-03:** Após handoff disparado: pausar o contactId, NÃO adicionar a resposta ao histórico da sessão (a conversa encerrou para a IA), e registrar log `info` com `contactId` e `reason: 'marker'`.

**Detecção de Urgência Pré-IA (Success Criterion 4)**

- **D-04:** Checar a mensagem do lead por palavras-chave de urgência antes de chamar a OpenAI. Se detectado: disparar handoff direto, enviar apenas a notificação `HANDOFF_MESSAGE`, sem gastar tokens. Não há texto da IA nesse fluxo.
- **D-05:** Lista de palavras-chave configurável via env var `URGENCY_KEYWORDS` (lista separada por vírgula). Default sugerido: `preso,liminar,audiência amanhã,habeas corpus,flagrante`. Case-insensitive, match parcial (`includes`).
- **D-06:** Guard de urgência entra em `webhookHandler.ts` imediatamente após os guards existentes (dedup, isFromMe, etc.) e antes do compliance flow. Mensagem de urgência pausa e notifica sem passar pela onboarding de LGPD.

**Estado de Pausa Persistido (HAND-04, HAND-05)**

- **D-07:** Estrutura do arquivo: JSON com objeto `{ [contactId]: { pausedAt: number, reason: "handoff" | "urgency" } }`.
- **D-08:** Path do arquivo: `./data/paused.json`. Path configurável via env var `PAUSED_STATE_FILE` com default `./data/paused.json`.
- **D-09:** Carregar o arquivo na inicialização do servidor. Gravar atomicamente após cada mudança (write + rename). Sem debounce.
- **D-10:** Em memória: `Map<string, { pausedAt: number; reason: string }>` como cache. Arquivo é a fonte da verdade para restarts.

**Mensagem de Notificação de Handoff (HAND-03)**

- **D-11:** Mensagem configurável via env var `HANDOFF_MESSAGE`. Default: `"Um de nossos advogados irá dar continuidade ao seu atendimento em breve. Obrigado pela paciência."`.
- **D-12:** A mensagem de handoff não recebe o disclaimer de "não constitui aconselhamento jurídico" — é uma mensagem operacional.

### Claude's Discretion

- Nome exato do novo service (`handoffService.ts` vs lógica inline em `webhookHandler.ts`)
- Implementação exata do write atômico do arquivo JSON (fs.writeFile + rename vs write direto)
- Campos adicionais de log para eventos de handoff além de `contactId` e `reason`
- Tratamento de erro ao falhar na leitura do arquivo de pausa na inicialização (warn + continuar com Map vazio vs fail-fast)

### Deferred Ideas (OUT OF SCOPE)

- **HAND-06 (v2):** Enviar resumo estruturado da qualificação ao advogado no momento do handoff. Requer segunda chamada à OpenAI.
- **SESS-01 (v2):** Endpoint de admin para reativar bot para contactId pausado após atendimento humano concluído.
- **Notificação ao advogado:** Alertar o advogado via Digisac quando handoff é disparado — fora do escopo v1.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HAND-01 | IA sinaliza necessidade de handoff com marcador `[HANDOFF]` na resposta | Marker detection via `aiReply.includes('[HANDOFF]')` in webhookHandler.ts after getAIResponse(); strip with `replaceAll('[HANDOFF]', '').trim()` |
| HAND-02 | Sistema detecta o marcador, remove-o da mensagem e pausa o bot para aquele contactId | `handoffService.isPaused()` guard + `handoffService.pause(contactId, 'marker')` after detection; confirmed working with Node.js string APIs |
| HAND-03 | Bot envia mensagem ao lead informando que um advogado irá assumir o atendimento | `sendMessage(contactId, env.HANDOFF_MESSAGE)` — reuses digisacService.sendMessage; no disclaimer (D-12) |
| HAND-04 | Estado de pausa por contactId é persistido em arquivo (sobrevive a restart/deploy) | `fs/promises` writeFile + rename for atomic write; `loadFromDisk()` at server startup; verified working on Node.js v24 |
| HAND-05 | Sistema ignora novas mensagens de leads com handoff ativo (não chama Claude nem envia resposta) | Guard 6 in webhookHandler.ts checks `handoffService.isPaused(contactId)` before compliance flow and AI call |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Urgency keyword detection | API / Backend (`webhookHandler.ts`) | — | Pure string matching on inbound message, belongs in guard chain at the same layer as all other guards |
| `[HANDOFF]` marker detection | API / Backend (`webhookHandler.ts`) | — | Post-AI response processing; same pipeline as disclaimer append |
| Pause state (in-memory) | API / Backend (`handoffService.ts`) | — | Runtime cache keyed by contactId; same tier as sessionService |
| Pause state (persistence) | Database / Storage (`data/paused.json`) | API / Backend | File is the durable record; in-memory Map is the read cache |
| Handoff notification delivery | API / Backend (`digisacService.ts`) | — | Reuses existing `sendMessage` — no new tier needed |
| Env var configuration | API / Backend (`utils/env.ts`) | — | Three new Zod fields; consistent with all Phase 1/2 configuration |

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fs/promises` | Node.js built-in | Atomic file I/O for `paused.json` | `writeFile` + `rename` is the POSIX-standard atomic write pattern; no npm package needed |
| `path` | Node.js built-in | Resolve `PAUSED_STATE_FILE` relative to `process.cwd()` | Consistent absolute path regardless of how the process is launched |
| `zod` | ^4.3.6 (existing) | Three new optional env vars with defaults | Already in stack; same pattern as `OPENAI_FALLBACK_MESSAGE` |

**No new npm packages are required for Phase 3.** All required capabilities are covered by Node.js built-ins and already-installed dependencies.

[VERIFIED: npm registry + local package.json inspection]

### What NOT to Add

| Package | Reason |
|---------|--------|
| `write-file-atomic` | Overkill — Node.js `writeFile` + `rename` is sufficient for this volume; adds a dependency for a pattern we can implement in 5 lines |
| Any database | Explicitly out of scope per PROJECT.md and CLAUDE.md |
| `node-persist` / `lowdb` | In-process JSON file with `fs/promises` is the stated architecture; no library needed |

---

## Architecture Patterns

### System Architecture Diagram

```
Inbound WhatsApp message
          │
          ▼
POST /digisac/webhook (routes/index.ts)
  │ token validation → 401 if invalid
  │ HTTP 200 sent immediately
          │
          ▼
setImmediate → handleWebhookAsync (webhookHandler.ts)
          │
          ├─ Guard 1: event === 'message.created'
          ├─ Guard 2: !isFromMe
          ├─ Guard 3: type === 'chat'
          ├─ Guard 4: !isDuplicate(msg.id)
          ├─ Guard 5: !empty text
          │
          ├─ Guard 6 [NEW]: isPaused(contactId)  ──► discard silently (HAND-05)
          │
          ├─ Guard 7 [NEW]: isUrgencyKeyword(msg.text)
          │       │ YES: pause(contactId, 'urgency')
          │       │      sendMessage(HANDOFF_MESSAGE)     ──► lead notified
          │       │      return
          │       │ NO: continue
          │
          ├─ runComplianceFlow() → false: return (await consent)
          │
          ▼
    getAIResponse(contactId, msg.text)
          │
          ▼
    aiReply includes '[HANDOFF]'?
          │
          ├─ YES:  strippedText = aiReply.replaceAll('[HANDOFF]', '').trim()
          │        sendMessage(contactId, appendDisclaimer(strippedText))  [msg 1]
          │        pause(contactId, 'marker')
          │        sendMessage(contactId, HANDOFF_MESSAGE)                 [msg 2]
          │        return  (no history update — D-03)
          │
          └─ NO:   sendMessage(contactId, appendDisclaimer(aiReply))
                   (normal path — unchanged from Phase 2)
```

### Recommended Project Structure

```
src/
├── handlers/
│   └── webhookHandler.ts    # Guards 6+7 inserted; marker detection block added
├── services/
│   ├── handoffService.ts    # [NEW] pause/isPaused/loadFromDisk/saveToDisk
│   ├── aiService.ts         # Unchanged
│   ├── sessionService.ts    # Unchanged
│   ├── digisacService.ts    # Unchanged
│   └── complianceService.ts # Unchanged
├── utils/
│   └── env.ts               # Three new Zod fields added
└── server.ts                # loadFromDisk() call added at startup
data/
└── paused.json              # Created on first pause; .gitignore entry added
```

### Pattern 1: handoffService Singleton

**What:** Module-level `Map` + four exported functions. Mirrors `sessionService.ts` singleton pattern.

**When to use:** Whenever any code needs to check or update pause state.

```typescript
// Source: VERIFIED by codebase inspection + Node.js docs [VERIFIED: Node.js built-in]
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

interface PauseRecord {
  pausedAt: number;
  reason: 'marker' | 'urgency';
}

const pausedContacts = new Map<string, PauseRecord>();

export function isPaused(contactId: string): boolean {
  return pausedContacts.has(contactId);
}

export async function pause(contactId: string, reason: 'marker' | 'urgency'): Promise<void> {
  pausedContacts.set(contactId, { pausedAt: Date.now(), reason });
  await saveToDisk();
}

export async function loadFromDisk(): Promise<void> {
  // File absent on first run = no paused contacts (correct initial state)
  ...
}

async function saveToDisk(): Promise<void> {
  // writeFile to .tmp then rename for atomicity
  ...
}
```

### Pattern 2: Atomic Write via writeFile + rename

**What:** Write to a `.tmp` sibling file then `rename` to the target. On POSIX systems (Linux/Railway), `rename` is atomic — no process can observe a partial write.

**When to use:** Any write to a JSON state file where partial content would corrupt the store.

```typescript
// Source: POSIX rename(2) semantics; VERIFIED on Node.js v24.13.1
async function saveToDisk(): Promise<void> {
  const filePath = path.resolve(env.PAUSED_STATE_FILE);
  const tmpPath = filePath + '.tmp';
  const data: Record<string, PauseRecord> = Object.fromEntries(pausedContacts);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}
```

**Important:** `path.dirname` on `./data/paused.json` returns `./data` — `mkdir({ recursive: true })` must be called before `writeFile` to create the `data/` directory on first pause. [VERIFIED: local Node.js test]

### Pattern 3: Urgency Keyword Guard

**What:** Case-insensitive partial-match check on inbound message text using `Array.prototype.some` + `String.prototype.includes`.

**When to use:** Guard 7 in `webhookHandler.ts`, immediately after Guard 5 (empty text) and before compliance flow.

```typescript
// Source: VERIFIED by local Node.js test
const urgencyKeywords: string[] = env.URGENCY_KEYWORDS
  .split(',')
  .map((k) => k.trim().toLowerCase())
  .filter(Boolean);

function isUrgencyKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return urgencyKeywords.some((kw) => lower.includes(kw));
}
```

**Verified behavior:**
- `"meu irmão foi preso hoje"` → `true` (keyword: `preso`)
- `"preciso de uma LIMINAR urgente"` → `true` (case-insensitive)
- `"tenho audiência amanhã de manhã"` → `true` (partial: `audiência amanhã` within longer string)
- `"boa tarde, quero contratar"` → `false`

[VERIFIED: local Node.js test, 2026-04-17]

### Pattern 4: [HANDOFF] Marker Stripping

**What:** Remove all occurrences of the literal string `[HANDOFF]` from AI reply text.

**Why `replaceAll` over `replace`:** `replace(string, string)` removes only the FIRST occurrence. If the AI includes `[HANDOFF]` twice (unlikely but possible), `replace` leaves the second. `replaceAll` is available in Node.js 20+ and handles the edge case cleanly.

```typescript
// Source: VERIFIED by local Node.js test
const strippedText = aiReply.replaceAll('[HANDOFF]', '').trim();
```

Note: CONTEXT.md D-02 specifies `replace('[HANDOFF]', '').trim()`. The planner should use `replaceAll` instead — safer with no downside. This is Claude's discretion per the "Implementação exata" discretion area.

[VERIFIED: Node.js v24.13.1 local test]

### Pattern 5: loadFromDisk Error Handling

**What:** On startup, attempt to read `paused.json`. Handle three distinct cases:

1. **File does not exist (ENOENT):** First run or clean deploy. Start with empty Map. `logger.info('paused state file not found — starting with empty state')`.
2. **File exists but is corrupt (SyntaxError):** Write to disk may have been interrupted on a crash. `logger.warn('paused state file corrupt — starting with empty state')`. Do NOT fail fast — an empty pause state is safer than a crashed server.
3. **File exists and is valid JSON:** Populate Map from parsed object. `logger.info({ count }, 'paused state loaded from disk')`.

```typescript
// Source: VERIFIED by local Node.js error code test
export async function loadFromDisk(): Promise<void> {
  try {
    const raw = await readFile(path.resolve(env.PAUSED_STATE_FILE), 'utf8');
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

[VERIFIED: ENOENT code and SyntaxError type confirmed by local Node.js test]

### Anti-Patterns to Avoid

- **Debouncing saveToDisk:** Handoffs are rare events (single-digit per day at law firm volume). A debounce that batches writes creates a window where a server crash between handoff and flush loses a paused contact. Write synchronously on every pause.
- **Calling appendDisclaimer on HANDOFF_MESSAGE:** D-12 explicitly prohibits this. The handoff notification is operational, not AI-generated.
- **Adding AI reply to session history when [HANDOFF] detected:** D-03 prohibits this. The conversation is over for the AI; polluting history with the handoff reply has no value and wastes tokens on a session that will never be used again.
- **Using `require('fs')` synchronous API (`writeFileSync`):** Blocks the event loop. Use `fs/promises` async variants.
- **Checking `data/paused.json` existence before reading:** Not needed — ENOENT catch handles it cleanly.
- **Urgency guard AFTER compliance flow:** D-06 requires urgency guard to come BEFORE `runComplianceFlow`. An unregistered lead in urgent distress must be handed off, not shown a consent form.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file write | Custom lock file mechanism | `writeFile(tmp) + rename(target)` | POSIX rename is atomic on Linux; no extra code or deps |
| Case-insensitive keyword matching | Regex engine | `text.toLowerCase().includes(kw)` | Simpler, faster, no regex compilation, same behavior |
| Persistent pause state | SQLite / Redis | `data/paused.json` | v1 law firm volumes; PROJECT.md explicitly out-scopes databases |
| Env var with default | Custom `process.env.X || 'default'` | `z.string().default(...)` in Zod schema | Consistent with all existing env var patterns; type-safe |

**Key insight:** Every capability in this phase has a 5–10 line implementation using Node.js built-ins. The complexity is in the integration ordering (guard chain position, disk-load timing) not in the data structures.

---

## Common Pitfalls

### Pitfall 1: Guard 6 Position — isPaused check must be BEFORE contactId extraction

**What goes wrong:** If the `isPaused` guard is placed after the `contactId` extraction block, a paused contact's message still reaches the `getOrCreateSession` call, creating/touching a session for a paused lead.

**Why it happens:** The contactId extraction block at line 91–95 of `webhookHandler.ts` uses `getOrCreateSession` indirectly. Any message that passes Guards 1–5 touches session state.

**How to avoid:** `isPaused` guard (Guard 6) must come IMMEDIATELY after Guards 1–5 pass and the `contactId` is extracted — before `getOrCreateSession` is called. Check the guard order in the implementation plan carefully.

**Warning signs:** Session TTL resets for paused contacts in logs.

### Pitfall 2: D-03 — History must NOT be updated when handoff is triggered by [HANDOFF] marker

**What goes wrong:** If `webhookHandler.ts` calls `getAIResponse()` and the response contains `[HANDOFF]`, the current `aiService.ts` commit path (`session.history = [...trimmed, { role: 'assistant', content: assistantText }]`) has already run inside `getAIResponse()` before the marker is detected in `webhookHandler.ts`.

**Why it happens:** `getAIResponse()` commits history internally on success (Pitfall 2 avoidance from Phase 2). The caller (`webhookHandler.ts`) has no way to "uncommit" this.

**Root cause analysis:** The commit happens at line 124 of `aiService.ts`: `session.history = [...trimmed, { role: 'assistant', content: assistantText }]`. This runs before the return value reaches `webhookHandler.ts`.

**Resolution options (for planner to decide):**

Option A — Accept history update: History contains the last AI turn (with [HANDOFF] stripped). Session will never be used again (contact is paused), so the history entry is harmless waste. Simpler — no code change to `aiService.ts`.

Option B — Skip history for handoff replies: Modify `getAIResponse()` to return additional metadata (e.g., a wrapper object `{ text: string; triggeredHandoff: boolean }`) so the caller can decide. More complex, requires changing the `aiService.ts` interface.

**Recommended resolution:** Option A. The session will never be accessed again for a paused contact. D-03 says "NÃO adicionar a resposta ao histórico" as a guideline for avoiding waste, but the functional consequence is nil. The planner should document this as a known acceptable deviation.

**Warning signs:** `aiService.ts` interface change would ripple to all call sites.

### Pitfall 3: HANDOFF_MESSAGE env var — must be loaded BEFORE first webhook

**What goes wrong:** If `handoffService.ts` reads `env.HANDOFF_MESSAGE` at module load time and the env module is imported before `dotenv/config`, the value is undefined.

**Why it happens:** `env.ts` loads `dotenv/config` via `import 'dotenv/config'` and must be the first import in `server.ts`. `handoffService.ts` imports `env.ts` — if that import chain is correct, there's no issue.

**How to avoid:** Verify `handoffService.ts` imports from `../utils/env.js` (same as all other services). The import order in `server.ts` already ensures env validation runs first.

### Pitfall 4: data/ directory not in .gitignore

**What goes wrong:** `paused.json` gets committed to git, leaking contactIds (personal data — LGPD concern).

**Why it happens:** The `data/` directory doesn't exist yet; it won't be auto-excluded.

**How to avoid:** Add `data/` to `.gitignore` in Wave 0. The directory and file must never be committed.

### Pitfall 5: replaceAll vs replace for [HANDOFF] stripping

**What goes wrong:** CONTEXT.md D-02 specifies `replace('[HANDOFF]', '').trim()` which only removes the FIRST occurrence. An AI that includes [HANDOFF] twice (unlikely but defensible) would have the second instance sent to the lead as literal text.

**How to avoid:** Use `replaceAll('[HANDOFF]', '').trim()` — available in Node.js 20+, no downside.

### Pitfall 6: loadFromDisk must complete before first webhook is processed

**What goes wrong:** If `loadFromDisk()` is called asynchronously at startup but the first webhook arrives before the Promise resolves, a paused contact's message could pass Guard 6 because the Map is still empty.

**How to avoid:** `await loadFromDisk()` must be called and awaited before `app.listen()` in `server.ts`. The current `server.ts` pattern calls `app.listen()` synchronously — restructure to:

```typescript
// server.ts startup sequence
await loadFromDisk();  // must complete before accepting connections
const server = app.listen(env.PORT, () => { ... });
```

This requires `server.ts` to be wrapped in an async IIFE or the top-level statements to be in an `async` function. Node.js 20 supports top-level await in ESM modules.

[VERIFIED: Node.js ESM top-level await available since Node.js 14.8; project uses `"type": "module"` in package.json]

---

## Code Examples

### handoffService.ts — Full Module Skeleton

```typescript
// Source: Node.js built-in fs/promises docs [VERIFIED]; pattern mirrors sessionService.ts
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

export interface PauseRecord {
  pausedAt: number;
  reason: 'marker' | 'urgency';
}

/** In-memory read cache. File is the durable source of truth. */
const pausedContacts = new Map<string, PauseRecord>();

export function isPaused(contactId: string): boolean {
  return pausedContacts.has(contactId);
}

export async function pause(contactId: string, reason: 'marker' | 'urgency'): Promise<void> {
  pausedContacts.set(contactId, { pausedAt: Date.now(), reason });
  logger.info({ contactId, reason }, 'contact paused — handoff triggered');
  await saveToDisk();
}

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

async function saveToDisk(): Promise<void> {
  const filePath = path.resolve(env.PAUSED_STATE_FILE);
  const tmpPath = filePath + '.tmp';
  const data: Record<string, PauseRecord> = Object.fromEntries(pausedContacts);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}

/** Test-only helper — clears in-memory state. */
export function __resetPausedContactsForTesting(): void {
  pausedContacts.clear();
}
```

### env.ts additions

```typescript
// Three new fields to add to the existing EnvSchema in src/utils/env.ts
// Source: existing env.ts pattern [VERIFIED: codebase inspection]

URGENCY_KEYWORDS: z
  .string()
  .default('preso,liminar,audiência amanhã,habeas corpus,flagrante'),

HANDOFF_MESSAGE: z
  .string()
  .default('Um de nossos advogados irá dar continuidade ao seu atendimento em breve. Obrigado pela paciência.'),

PAUSED_STATE_FILE: z
  .string()
  .default('./data/paused.json'),
```

### webhookHandler.ts — Guard 6 + 7 insertion points

```typescript
// Source: existing webhookHandler.ts [VERIFIED: codebase inspection]
// Insert after line 95 (contactId extraction), before getOrCreateSession call

// Guard 6: paused contacts (HAND-05) — check BEFORE session touch
if (isPaused(contactId)) {
  log.info('discarded: contact is paused (handoff active)');
  return;
}

// Guard 7: urgency keywords — bypass compliance, trigger immediate handoff (D-04, D-06)
if (isUrgencyKeyword(msg.text)) {
  log.info({ text: msg.text }, 'urgency keyword detected — triggering immediate handoff');
  await pause(contactId, 'urgency');
  await sendMessage(contactId, env.HANDOFF_MESSAGE);
  return;
}
```

```typescript
// Insert in webhookHandler.ts after `const aiReply = await getAIResponse(...)`:
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

### server.ts — startup change for loadFromDisk

```typescript
// Source: Node.js ESM top-level await [VERIFIED: Node.js 20+ ESM support]
// Replace synchronous server start with async IIFE in server.ts:

import { loadFromDisk } from './services/handoffService.js';

// ... existing imports and middleware setup ...

// Wrap the listen call:
await loadFromDisk(); // must complete before accepting connections (Pitfall 6)
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started');
});
```

### .gitignore addition

```
# Runtime data — contains contactIds (LGPD: must not be committed)
data/
```

---

## Runtime State Inventory

> Phase 3 is a feature addition (not a rename/refactor), so this section documents new runtime state introduced.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `data/paused.json` — new file, does not exist yet | Created on first pause; no migration needed |
| Live service config | None — no external service config changes | None |
| OS-registered state | None | None |
| Secrets/env vars | Three new optional env vars: `URGENCY_KEYWORDS`, `HANDOFF_MESSAGE`, `PAUSED_STATE_FILE` | Add to `.env.example`; all have defaults so not blocking |
| Build artifacts | None | None |

**Nothing found requiring data migration:** This is a greenfield addition.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `fs/promises` | `handoffService.saveToDisk/loadFromDisk` | Yes | Built-in (Node v24.13.1) | — |
| Node.js `path` | Path resolution for `PAUSED_STATE_FILE` | Yes | Built-in | — |
| `data/` directory | `paused.json` storage | No (does not exist) | — | Created by `mkdir({ recursive: true })` on first pause — no manual action required |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `data/` directory — auto-created on first pause via `mkdir({ recursive: true })`. Wave 0 should add `data/` to `.gitignore` proactively.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom atomic-write library (`write-file-atomic`) | `fs/promises.writeFile + rename` | Node.js 10+ | No dependency needed; same atomicity guarantee on POSIX |
| `String.replace` for first-occurrence removal | `String.replaceAll` | Node.js 15+ (ES2021) | Handles edge case of repeated marker in same reply |
| Synchronous `require('fs').readFileSync` at startup | Async `fs/promises.readFile` with `await` at startup | Node.js 10+ | Non-blocking; consistent with rest of async codebase |

---

## Open Questions

1. **D-03 History update on AI-triggered handoff**
   - What we know: `getAIResponse()` commits history internally before returning. The handoff marker is detected in `webhookHandler.ts` AFTER the commit has already happened inside `aiService.ts`.
   - What's unclear: Whether the product owner cares that the final assistant turn (the one with [HANDOFF]) is stored in history for a contact that will never be resumed.
   - Recommendation: Accept Option A (history contains the final turn). The session is never used again. Documented in Pitfall 2 above.

2. **Urgency guard position relative to contactId extraction**
   - What we know: `contactId` is extracted at line 91 of `webhookHandler.ts`, immediately before the urgency guard would be inserted.
   - What's unclear: Whether `pause(contactId, 'urgency')` should be called even if `contactId` is undefined (which causes a `logger.error` and early return at line 95).
   - Recommendation: Urgency guard runs AFTER the contactId null-check (line 95). A message with no contactId cannot be paused meaningfully and the existing error-log + return handles it.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `rename()` on Linux/Railway provides atomic swap (old content or new, never partial) | Architecture Patterns / Pattern 2 | If Railway uses a filesystem where rename is NOT atomic (e.g., cross-device), a server crash between writeFile and rename could corrupt paused.json. Mitigation: ENOENT + SyntaxError handling in loadFromDisk already handles corrupt files gracefully. [ASSUMED: Railway uses ext4 on local volume; standard POSIX guarantee applies] |
| A2 | The urgency guard triggering before LGPD compliance is the correct product behavior for a law firm emergency context | Architectural Responsibility Map | If wrong (compliance team requires consent even for emergencies), urgency guard position would need to move after compliance flow — reversing D-06 |

---

## Security Domain

> `security_enforcement` is not explicitly `false` in config — applying standard review.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not applicable — no new auth surface |
| V3 Session Management | Yes (pause state) | `Map` + file; no external session tokens; contact is paused, not "logged out" |
| V4 Access Control | No | No new endpoints or admin actions in Phase 3 (SESS-01 deferred) |
| V5 Input Validation | Yes | `URGENCY_KEYWORDS` env var: validated via Zod `z.string().default()` — no injection risk; keywords are used only in `String.includes`, never as regex or SQL |
| V6 Cryptography | No | No cryptographic operations introduced |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| contactId in `paused.json` leaks personal data (LGPD) | Information Disclosure | `data/` in `.gitignore`; file never committed; file path configurable to non-web-accessible location |
| Urgency keyword list bypass (attacker avoids keywords) | Spoofing/Elevation | Not a security threat per se — keywords are a UX shortcut, not a security gate; normal handoff via `[HANDOFF]` marker still works |
| `paused.json` file permissions | Information Disclosure | Default `umask` is 022 on Linux; file is readable by process owner only. Acceptable for single-process deploy. |

---

## Sources

### Primary (HIGH confidence)
- Node.js v24.13.1 local runtime — `fs/promises` API, `rename` behavior, `replaceAll`, ENOENT error code, ESM top-level await: all verified by local execution
- `/home/rodrigo/botLP/src/handlers/webhookHandler.ts` — guard chain structure, integration points
- `/home/rodrigo/botLP/src/services/aiService.ts` — history commit pattern, FallbackAlreadySent sentinel
- `/home/rodrigo/botLP/src/services/sessionService.ts` — singleton pattern to mirror
- `/home/rodrigo/botLP/src/utils/env.ts` — Zod schema patterns for new env vars
- `/home/rodrigo/botLP/package.json` — confirmed no test runner installed; `"type": "module"` ESM confirmed

### Secondary (MEDIUM confidence)
- POSIX rename(2) atomicity guarantee — standard POSIX behavior; assumed to apply on Railway's Linux containers [ASSUMED: see A1]

### Tertiary (LOW confidence)
- Railway filesystem type — assumed ext4 or similar POSIX-compliant local storage based on Railway documentation patterns; not verified against Railway's current infrastructure docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all capabilities use Node.js built-ins; no new npm packages; verified against local runtime
- Architecture: HIGH — derived directly from existing codebase inspection; integration points are unambiguous
- Pitfalls: HIGH — Pitfalls 1, 3, 4, 5, 6 verified by code inspection; Pitfall 2 is a known design trade-off with documented resolution

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable Node.js built-in APIs; no ecosystem drift risk)
