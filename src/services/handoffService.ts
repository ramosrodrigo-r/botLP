/**
 * handoffService — Phase 3 pause state with disk persistence.
 *
 * Responsibilities:
 *  - In-memory read cache (Map<contactId, PauseRecord>) — HAND-05 guard consults this.
 *  - Disk-backed durability (data/paused.json) — HAND-04: paused contacts survive restart.
 *  - Atomic disk writes via writeFile(tmp) + rename(target) — POSIX atomicity on Railway's Linux.
 *  - Graceful startup: loadFromDisk tolerates ENOENT (first run) and corrupt JSON (crash mid-write).
 *
 * Design decisions (from 03-CONTEXT.md):
 *  - D-07: record shape { pausedAt: number; reason: 'marker' | 'urgency' }
 *  - D-08: path comes from env.PAUSED_STATE_FILE (default ./data/paused.json)
 *  - D-09: load on startup; write atomically on every pause; no debounce
 *  - D-10: Map is cache; file is source of truth
 *
 * Pattern mirror: sessionService.ts — same singleton Map + exported functions + __reset helper.
 */
import { writeFile, readFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

export interface PauseRecord {
  pausedAt: number;           // Date.now()
  reason: 'marker' | 'urgency';
}

/**
 * Module-level singleton. Not exported — callers use the functions below.
 * File (env.PAUSED_STATE_FILE) is the durable source of truth; this Map is
 * a synchronous read cache populated by loadFromDisk() at startup.
 */
const pausedContacts = new Map<string, PauseRecord>();

/**
 * HAND-05 guard check — synchronous (no I/O). Called inside webhookHandler's
 * guard chain; must stay O(1) so paused messages are discarded cheaply.
 */
export function isPaused(contactId: string): boolean {
  return pausedContacts.has(contactId);
}

/**
 * Pause a contact and persist to disk atomically.
 *
 * Called from webhookHandler.ts on:
 *  - urgency keyword detection (reason: 'urgency')
 *  - [HANDOFF] marker in AI reply    (reason: 'marker')
 *
 * Writes synchronously (no debounce per D-09) — handoffs are rare events
 * (single-digit per day at law firm volume). A crash between pause() and
 * the next inbound message would lose state; atomic write + immediate flush
 * minimizes that window.
 */
export async function pause(
  contactId: string,
  reason: 'marker' | 'urgency',
): Promise<void> {
  pausedContacts.set(contactId, { pausedAt: Date.now(), reason });
  logger.info({ contactId, reason }, 'contact paused — handoff triggered');
  await saveToDisk();
}

/**
 * Load paused state from disk on server startup.
 *
 * MUST be awaited in server.ts before app.listen() accepts connections
 * (see RESEARCH.md Pitfall 6) — otherwise the Map is empty for the
 * first webhook and a previously-paused contact would slip past Guard 6.
 *
 * Error handling (RESEARCH.md Pattern 5):
 *  - ENOENT  → first run / clean deploy; start with empty Map (info log)
 *  - SyntaxError / other → file corrupt (interrupted write); start empty (warn log)
 *                          Do NOT fail fast — empty pause state is safer than a crashed server.
 *  - Valid JSON → populate Map from parsed object
 */
export async function loadFromDisk(): Promise<void> {
  const filePath = path.resolve(env.PAUSED_STATE_FILE);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, PauseRecord>;
    for (const [contactId, record] of Object.entries(parsed)) {
      pausedContacts.set(contactId, record);
    }
    logger.info({ count: pausedContacts.size, filePath }, 'paused contacts loaded from disk');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info({ filePath }, 'paused state file not found — starting with empty state');
    } else {
      logger.warn({ err, filePath }, 'paused state file unreadable — starting with empty state');
    }
  }
}

/**
 * Atomic write via temp file + rename. POSIX rename is atomic on the same
 * filesystem (Linux ext4, which Railway uses) — no consumer can observe a
 * partial write. mkdir(recursive) creates ./data on first pause.
 */
async function saveToDisk(): Promise<void> {
  const filePath = path.resolve(env.PAUSED_STATE_FILE);
  const tmpPath = filePath + '.tmp';
  const data: Record<string, PauseRecord> = Object.fromEntries(pausedContacts);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}

/**
 * Test-only helper — clears the in-memory Map. Does NOT touch the file on
 * disk (callers that want a clean file should delete it explicitly).
 * Mirrors __resetSessionStoreForTesting in sessionService.ts.
 */
export function __resetPausedContactsForTesting(): void {
  pausedContacts.clear();
}
