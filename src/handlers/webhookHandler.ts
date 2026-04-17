import type { WebhookPayload } from '../types/digisac.js';
import { logger } from '../utils/logger.js';
import { env } from '../utils/env.js';
import { runComplianceFlow, appendDisclaimer } from '../services/complianceService.js';
import { getAIResponse, FallbackAlreadySent } from '../services/aiService.js';
import { sendMessage } from '../services/digisacService.js';
import { getOrCreateSession } from '../services/sessionService.js';
import { isPaused, pause } from '../services/handoffService.js';

/**
 * Deduplication: Map<messageId, timestamp_ms> with 60s TTL, lazy eviction.
 * Per D-09: no setInterval — ID cleanup happens during the next lookup.
 * 60s is sufficient for Digisac retries (which occur within seconds).
 */
const seenMessages = new Map<string, number>();
const DEDUP_TTL_MS = 60_000;

function isDuplicate(messageId: string): boolean {
  const seenAt = seenMessages.get(messageId);
  if (seenAt === undefined) return false;
  if (Date.now() - seenAt > DEDUP_TTL_MS) {
    seenMessages.delete(messageId); // lazy eviction
    return false;
  }
  return true;
}

function recordSeen(messageId: string): void {
  seenMessages.set(messageId, Date.now());
}

/**
 * URGENCY_KEYWORDS — parsed once at module load (not per-message) for perf.
 * Split on comma, trim whitespace, lowercase, drop empties.
 * D-05: case-insensitive partial match via String.includes.
 */
const urgencyKeywords: string[] = env.URGENCY_KEYWORDS
  .split(',')
  .map((k) => k.trim().toLowerCase())
  .filter(Boolean);

/**
 * D-04/D-06: return true if the inbound text contains any urgency keyword
 * as a substring (case-insensitive). Consumed by Guard 7.
 */
function isUrgencyKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return urgencyKeywords.some((kw) => lower.includes(kw));
}

/**
 * Processes an incoming Digisac webhook body AFTER HTTP 200 has been sent.
 * Called from a setImmediate callback in routes/index.ts, so errors here do
 * NOT affect the HTTP response — the top-level catch in routes logs them.
 *
 * Guard chain (WBHK-03, WBHK-04, WBHK-06, HAND-05, urgency):
 *   1. event === 'message.created'       (drop other events)
 *   2. !isFromMe                          (WBHK-03: ignore outbound — prevents loop)
 *   3. type === 'chat'                    (WBHK-04: text-only; SDK uses 'chat' NOT 'text')
 *   4. !isDuplicate(msg.id)               (WBHK-06: dedup by message id, 60s TTL)
 *   5. !empty text                        (WR-03: no empty user turns to OpenAI)
 *   6. !isPaused(contactId)               (HAND-05: paused contact → no reply, no AI call)
 *   7. !isUrgencyKeyword(msg.text)        (D-04/D-06: urgency → immediate handoff,
 *                                          bypasses LGPD compliance)
 *
 * Every guard returns silently. HTTP 200 is already sent — never re-respond.
 * Per RESEARCH.md Pitfall 3: non-200 causes Digisac retries, creating floods.
 */
export async function handleWebhookAsync(body: unknown): Promise<void> {
  const payload = body as WebhookPayload;

  // Guard 1: non-message events
  if (payload.event !== 'message.created') {
    logger.debug({ event: payload.event }, 'discarded: non-message event');
    return;
  }

  const msg = payload.data;

  // Guard 2: outbound messages (WBHK-03)
  // isFromMe === true means the message was sent by the connected WhatsApp
  // account (bot or human agent). Never react to our own messages.
  if (msg.isFromMe) {
    logger.debug({ messageId: msg.id }, 'discarded: isFromMe');
    return;
  }

  // Guard 3: non-text message types (WBHK-04)
  // CRITICAL (RESEARCH.md Pitfall 1): Digisac uses msg.type === 'chat' for
  // standard text messages. The integration guide's 'text' value is WRONG —
  // verified against @ikatec/digisac-api-sdk v2.1.1 MessageType union.
  if (msg.type !== 'chat') {
    logger.debug({ messageId: msg.id, type: msg.type }, 'discarded: non-chat type');
    return;
  }

  // Guard 4: dedup (WBHK-06)
  if (isDuplicate(msg.id)) {
    logger.debug({ messageId: msg.id }, 'discarded: duplicate');
    return;
  }
  recordSeen(msg.id);

  // Guard 5: empty text body (WR-03)
  // WhatsApp occasionally delivers chat-typed messages with no text (e.g. corrupted delivery).
  // Sending an empty user turn to OpenAI wastes tokens and pollutes history.
  if (!msg.text.trim()) {
    logger.debug({ messageId: msg.id }, 'discarded: empty text body');
    return;
  }

  // All guards passed — process.
  // CR-01: Message SDK type has no contactId field — Digisac sends it as an undeclared extra
  // field on the flat payload. Cast through unknown to acknowledge the gap between SDK types
  // and the actual API response shape.
  const contactId = (msg as Record<string, unknown>)['contactId'] as string | undefined;
  if (!contactId) {
    logger.error({ messageId: msg.id }, 'contactId missing from payload — cannot route session');
    return;
  }
  const log = logger.child({ contactId, messageId: msg.id, event: payload.event });
  log.info('processing message');

  // Guard 6: paused contacts (HAND-05) — check BEFORE any session touch or AI call.
  // Paused contactId = an attorney took over; the bot must produce NO reply and
  // NO OpenAI call. Pitfall 1: this guard runs before getOrCreateSession so the
  // session TTL is not reset for a paused lead.
  if (isPaused(contactId)) {
    log.info('discarded: contact is paused (handoff active)');
    return;
  }

  // Guard 7: urgency keywords (D-04, D-06 / Success Criterion 4) — triggers
  // immediate handoff WITHOUT calling OpenAI and WITHOUT running the LGPD
  // compliance flow. An emergency message from a lead who has not yet consented
  // still gets handed to a human attorney immediately. The handoff notification
  // is sent directly (no disclaimer per D-12) — it's an operational message.
  if (isUrgencyKeyword(msg.text)) {
    log.info({ matchedText: msg.text }, 'urgency keyword detected — triggering immediate handoff');
    await pause(contactId, 'urgency');
    await sendMessage(contactId, env.HANDOFF_MESSAGE);
    return;
  }

  // WR-01: touch TTL clock on every inbound message, not only after AI success.
  // Prevents TTL expiry mid-compliance-onboarding for contacts who take >24h to reply.
  const session = getOrCreateSession(contactId);
  session.lastAccessAt = Date.now();

  // COMP-01 + COMP-02: disclosure + LGPD consent flow.
  // If runComplianceFlow returns false, onboarding messages were just sent
  // and we wait for the user's next message (which is implicit consent).
  const shouldProceed = await runComplianceFlow(contactId);
  if (!shouldProceed) {
    log.info('compliance onboarding sent; awaiting user reply');
    return;
  }

  // CONV-03/CONV-04/CONV-05: full AI pipeline.
  // aiService handles mutex (CONV-02), TTL reset (D-03/D-04), and 429 fallback (CONV-05).
  // On 429 the fallback is sent by aiService directly and FallbackAlreadySent is thrown to
  // prevent double-delivery of the fallback text here.
  try {
    const aiReply = await getAIResponse(contactId, msg.text);

    // HAND-01/HAND-02/HAND-03: [HANDOFF] marker detection.
    // D-01: send AI text (with disclaimer) as message 1, then HANDOFF_MESSAGE as message 2.
    // D-02/Pitfall 5: use replaceAll (not replace) so multiple markers are all stripped.
    // D-12: HANDOFF_MESSAGE is operational — no appendDisclaimer.
    // D-03: the session history was already committed inside getAIResponse (Pitfall 2
    //   Option A — acceptable because the session will never be resumed for a paused contact).
    if (aiReply.includes('[HANDOFF]')) {
      const strippedText = aiReply.replaceAll('[HANDOFF]', '').trim();
      if (strippedText) {
        await sendMessage(contactId, appendDisclaimer(strippedText));
      }
      await pause(contactId, 'marker');
      await sendMessage(contactId, env.HANDOFF_MESSAGE);
      log.info({ reason: 'marker', textLength: strippedText.length }, 'handoff triggered by AI marker');
      return;
    }

    // Normal path — unchanged from Phase 2.
    await sendMessage(contactId, appendDisclaimer(aiReply));
    log.info({ replyLength: aiReply.length }, 'AI reply sent to lead');
  } catch (err) {
    if (err instanceof FallbackAlreadySent) {
      log.info('429 fallback already delivered by aiService; skipping second send');
      return;
    }
    throw err;
  }
}
