import type { WebhookPayload } from '@ikatec/digisac-api-sdk/incommingWebhooks';
import { logger } from '../utils/logger.js';
import { runComplianceFlow } from '../services/complianceService.js';

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
 * Processes an incoming Digisac webhook body AFTER HTTP 200 has been sent.
 * Called from a setImmediate callback in routes/index.ts, so errors here do
 * NOT affect the HTTP response — the top-level catch in routes logs them.
 *
 * Guard chain (WBHK-03, WBHK-04, WBHK-06):
 *   1. event === 'message.created'       (drop other events)
 *   2. !isFromMe                          (WBHK-03: ignore outbound — prevents loop)
 *   3. type === 'chat'                    (WBHK-04: text-only; SDK uses 'chat' NOT 'text')
 *   4. !isDuplicate(msg.id)               (WBHK-06: dedup by message id, 60s TTL)
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

  // All guards passed — process.
  const contactId = msg.contactId;
  const log = logger.child({ contactId, messageId: msg.id, event: payload.event });
  log.info('processing message');

  // COMP-01 + COMP-02: disclosure + LGPD consent flow.
  // If runComplianceFlow returns false, onboarding messages were just sent
  // and we wait for the user's next message (which is implicit consent).
  const shouldProceed = await runComplianceFlow(contactId);
  if (!shouldProceed) {
    log.info('compliance onboarding sent; awaiting user reply');
    return;
  }

  // Phase 2: wire AI pipeline here.
  //   const aiReply = await getAIResponse(contactId, msg.text);
  //   await sendMessage(contactId, appendDisclaimer(aiReply));
  log.debug('compliance satisfied; Phase 2 AI pipeline would run here');
}
