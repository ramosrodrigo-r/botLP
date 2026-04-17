import OpenAI from 'openai';

/**
 * Unified per-contact session state.
 *
 * Single source of truth for all per-contact data in Phase 2:
 * - history: OpenAI conversation history (moved from aiService.ts in Plan 02)
 * - consentGiven / disclosureSent: compliance flags (moved from complianceService.ts here)
 * - lastAccessAt: epoch ms used for 24h TTL check (D-03, D-04)
 *
 * Design decisions:
 * - D-03: 24h TTL — lazy check in aiService.ts (Plan 02) via isSessionExpired
 * - D-04: tudo expira junto — resetSession resets history + compliance flags atomically
 * - No mutex here — synchronous Map operations are race-free within this file.
 *   Async mutex lives in aiService.ts (Plan 02).
 */
export interface SessionState {
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  consentGiven: boolean;
  disclosureSent: boolean;
  lastAccessAt: number; // epoch ms from Date.now()
}

/** 24-hour TTL in milliseconds (D-03). */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h (D-03)

/**
 * Module-level singleton Map. Not exported — callers use the functions below.
 * Acceptable for v1 single-instance deployment (T-02-05).
 */
const sessions = new Map<string, SessionState>();

/**
 * Returns the SessionState for a contact, creating a fresh one if none exists.
 *
 * The returned reference is the live Map entry — mutations on it persist
 * without a separate set() call (JavaScript object reference semantics).
 */
export function getOrCreateSession(contactId: string): SessionState {
  let session = sessions.get(contactId);
  if (!session) {
    session = {
      history: [],
      consentGiven: false,
      disclosureSent: false,
      lastAccessAt: Date.now(),
    };
    sessions.set(contactId, session);
  }
  return session;
}

/**
 * Replaces the stored SessionState for a contact with a fresh zero-value record.
 *
 * Called by Plan 02's aiService.ts when isSessionExpired() is true (D-04):
 * atomically resets history + compliance flags so a returning lead re-sees
 * disclosure + LGPD consent on their next message.
 */
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

/**
 * Returns true if the session has been idle for longer than SESSION_TTL_MS.
 *
 * Uses lastAccessAt — callers (Plan 02, aiService.ts) are responsible for
 * updating lastAccessAt when the session is actively used.
 */
export function isSessionExpired(session: SessionState): boolean {
  return Date.now() - session.lastAccessAt > SESSION_TTL_MS;
}

/**
 * Test-only helper: clears all stored sessions from the in-memory Map.
 * Do not call in production — this erases all per-contact state globally.
 *
 * Mirrors the pattern from complianceService.ts __resetComplianceStoreForTesting.
 */
export function __resetSessionStoreForTesting(): void {
  sessions.clear();
}
