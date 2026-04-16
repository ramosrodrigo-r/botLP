import { env } from '../utils/env.js';
import { sendMessage } from './digisacService.js';
import { logger } from '../utils/logger.js';

/**
 * Per-contact compliance flags.
 *
 * State is in-memory (Map) — Phase 1 does not persist. On server restart, a
 * returning lead sees the disclosure + consent prompt again. This is acceptable
 * UX for v1 per D-07 and is documented here so the behavior is not confused
 * with a bug. Phase 3 introduces restart-safe state for handoff only.
 */
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
 */
export async function runComplianceFlow(contactId: string): Promise<boolean> {
  const log = logger.child({ contactId, service: 'compliance' });
  const state = getState(contactId);

  if (!state.disclosureSent) {
    log.info('new contact — sending AI disclosure and LGPD consent prompt');
    await sendMessage(contactId, env.DISCLOSURE_MESSAGE);
    await sendMessage(contactId, env.LGPD_CONSENT_MESSAGE);
    state.disclosureSent = true;
    // consentGiven stays false — the user's NEXT message is the implicit consent (D-05/D-06).
    return false;
  }

  if (!state.consentGiven) {
    // D-05/D-06: any subsequent message = implicit consent. Proceed to AI.
    state.consentGiven = true;
    log.info('implicit LGPD consent recorded (any reply after consent prompt)');
    return true;
  }

  log.debug('compliance already satisfied for contact; proceeding');
  return true;
}

/**
 * Appends the legal disclaimer to AI-generated text.
 *
 * D-04 exact format: <text>\n\n---\n⚠️ ${LEGAL_DISCLAIMER}
 *
 * COMP-03 requires this append to be in CODE, never relying on the system
 * prompt. Every code path that sends AI output to a lead MUST pipe it through
 * this function — see RESEARCH.md Pitfall 5.
 */
export function appendDisclaimer(text: string): string {
  return `${text}\n\n---\n⚠️ ${env.LEGAL_DISCLAIMER}`;
}

/**
 * Test-only helper: clears the compliance store. Used in plan 03 verification.
 * Exported to avoid leaking the internal Map. Not intended for production use.
 */
export function __resetComplianceStoreForTesting(): void {
  complianceStore.clear();
}
