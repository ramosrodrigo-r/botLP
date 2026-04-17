import { env } from '../utils/env.js';
import { sendMessage } from './digisacService.js';
import { logger } from '../utils/logger.js';
import { getOrCreateSession } from './sessionService.js';
import { __resetSessionStoreForTesting } from './sessionService.js';

/**
 * Runs the OAB disclosure + LGPD consent flow for a contact.
 *
 * Decisions implemented:
 * - D-05: Any reply after the consent prompt counts as implicit acceptance.
 *   No keyword matching required — reduces friction; suitable for WhatsApp.
 * - D-06: If a message arrives without disclosureSent (fresh state / restart),
 *   send disclosure + consent and return false. Next message = implicit consent.
 * - D-07: State is in-memory; restart clears it (acceptable v1 UX).
 *
 * Returns:
 *   true  — caller should proceed to AI processing (consent is given).
 *   false — compliance messaging was just sent; stop here and await next message.
 *
 * COMP-01: disclosure sent on first interaction per contact.
 * COMP-02: LGPD consent prompt sent before any data collection; implicit accept.
 *
 * State now lives in sessionService (SessionState.disclosureSent, SessionState.consentGiven).
 * No internal Map — this module is stateless. Phase 2 TTL reset (D-04) in aiService.ts
 * atomically resets both compliance flags via resetSession().
 */
export async function runComplianceFlow(contactId: string): Promise<boolean> {
  const log = logger.child({ contactId, service: 'compliance' });
  const session = getOrCreateSession(contactId);

  if (!session.disclosureSent) {
    log.info('new contact — sending AI disclosure and LGPD consent prompt');
    await sendMessage(contactId, env.DISCLOSURE_MESSAGE);
    await sendMessage(contactId, env.LGPD_CONSENT_MESSAGE);
    session.disclosureSent = true;
    // consentGiven stays false — the user's NEXT message is the implicit consent (D-05/D-06).
    return false;
  }

  if (!session.consentGiven) {
    // D-05/D-06: any subsequent message = implicit consent. Proceed to AI.
    session.consentGiven = true;
    log.info('implicit LGPD consent recorded (any reply after consent prompt)');
    return true;
  }

  log.debug('compliance already satisfied for contact; proceeding');
  return true;
}

/**
 * Appends the legal disclaimer to AI-generated text.
 *
 * Format: <text>\n\n---\n${LEGAL_DISCLAIMER}
 *
 * LEGAL_DISCLAIMER env var controls the full footer text — include any desired
 * prefix (e.g. "⚠️ ...") in the env var value rather than hardcoding it here.
 *
 * COMP-03 requires this append to be in CODE, never relying on the system
 * prompt. Every code path that sends AI output to a lead MUST pipe it through
 * this function — see RESEARCH.md Pitfall 5.
 */
export function appendDisclaimer(text: string): string {
  return `${text}\n\n---\n${env.LEGAL_DISCLAIMER}`;
}

/**
 * Test-only helper. Compliance state now lives in sessionService.
 * This alias is kept so existing test code that called the old name continues to work.
 */
export function __resetComplianceStoreForTesting(): void {
  __resetSessionStoreForTesting();
}
