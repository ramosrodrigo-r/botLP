import OpenAI from 'openai';
import { Mutex } from 'async-mutex';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { sendMessage } from './digisacService.js';
import {
  getOrCreateSession,
  resetSession,
  isSessionExpired,
} from './sessionService.js';

/**
 * aiService — Phase 2 AI pipeline.
 *
 * Responsibilities:
 *  - Per-contactId Mutex (CONV-02): serialize concurrent messages for the same contact.
 *  - TTL lazy check (D-03/D-04): reset SessionState if inactive >24h; disclosureSent/consentGiven
 *    reset atomically with history (tudo expira junto).
 *  - OpenAI chat.completions.create call with SYSTEM_PROMPT + trimmed history (CONV-03, CONV-04).
 *  - OpenAI 429 graceful fallback (CONV-05): send OPENAI_FALLBACK_MESSAGE, warn log, no history
 *    contamination (Pitfall 2).
 *
 * State is held in SessionState (sessionService.ts). This module holds only the Mutex Map.
 */

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Mutex registry. Keyed by contactId. Lazy-removed after release when !isLocked() (D-02).
// NOTE: getMutex MUST be synchronous — no await between Map.get and Map.set — so that
// two concurrent callers cannot both see undefined and create two separate Mutex instances.
// Node.js single-threaded execution guarantees no interleaving within a synchronous function.
const mutexes = new Map<string, Mutex>();

function getMutex(contactId: string): Mutex {
  let mutex = mutexes.get(contactId);
  if (!mutex) {
    mutex = new Mutex();
    mutexes.set(contactId, mutex);
  }
  return mutex;
}

/**
 * Sentinel error thrown when the OpenAI 429 fallback message has already been
 * sent directly from aiService. webhookHandler catches this and returns without
 * calling sendMessage again, preventing double-delivery of the fallback text.
 *
 * Pattern: aiService sends the fallback → throws FallbackAlreadySent →
 * webhookHandler catches → skips appendDisclaimer + sendMessage pipeline.
 */
export class FallbackAlreadySent extends Error {
  constructor() {
    super('OpenAI 429 fallback message already sent directly from aiService');
    this.name = 'FallbackAlreadySent';
  }
}

export async function getAIResponse(
  contactId: string,
  userMessage: string,
): Promise<string> {
  const log = logger.child({ contactId });
  const mutex = getMutex(contactId);
  const release = await mutex.acquire();

  try {
    // TTL lazy check (D-03/D-04): if inactive >24h, reset session atomically.
    let session = getOrCreateSession(contactId);
    if (isSessionExpired(session)) {
      log.info(
        { lastAccessAt: new Date(session.lastAccessAt).toISOString() },
        'session TTL expired — resetting history + consent flags',
      );
      session = resetSession(contactId);
    }

    // Pitfall 2 avoidance: build pendingHistory as a local copy; do NOT mutate session.history
    // until after a successful response. On 429 or other errors, session.history is untouched.
    const pendingHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...session.history,
      { role: 'user', content: userMessage },
    ];
    const trimmed = pendingHistory.slice(-20); // D-05: 20 messages (10 exchanges)
    log.debug({ historyLength: trimmed.length }, 'calling OpenAI chat.completions.create');

    let assistantText: string;
    try {
      const response = await client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: 'system', content: env.SYSTEM_PROMPT },
          ...trimmed,
        ],
      });
      assistantText = response.choices[0]?.message?.content ?? '';
    } catch (err) {
      if (err instanceof OpenAI.RateLimitError) {
        log.warn(
          {
            openaiStatus: err.status,
            requestId: err.request_id ?? undefined,
            timestamp: new Date().toISOString(),
          },
          'OpenAI rate limit — sending fallback message to lead',
        );
        // Send fallback directly — caller must not send again (Pitfall 2: no history mutation).
        await sendMessage(contactId, env.OPENAI_FALLBACK_MESSAGE);
        throw new FallbackAlreadySent();
      }
      // All other OpenAI errors (AuthenticationError, InternalServerError, etc.) rethrow.
      throw err;
    }

    // Commit ONLY on success. Now safe to update session state.
    session.history = [...trimmed, { role: 'assistant', content: assistantText }];
    session.lastAccessAt = Date.now();

    return assistantText;
  } finally {
    release();
    // Lazy removal of idle mutexes (D-02) — consistent with dedup lazy eviction (Phase 1 D-09).
    // isLocked() returns false when no one holds the lock AND no waiters are queued.
    if (!mutex.isLocked()) {
      mutexes.delete(contactId);
    }
  }
}

/**
 * Test-only helper — clears the mutex registry. Session state is cleared separately
 * via sessionService.__resetSessionStoreForTesting.
 */
export function __resetMutexesForTesting(): void {
  mutexes.clear();
}
