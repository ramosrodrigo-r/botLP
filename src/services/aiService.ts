/**
 * Phase 2 stub. The signature is what matters for Phase 1 compilation and
 * Phase 2 wiring. Do NOT implement AI logic here in Phase 1.
 *
 * Phase 2 will: call @anthropic-ai/sdk client.messages.create() with conversation
 * history loaded per contactId. Returns the assistant's text (pre-disclaimer).
 */
import { logger } from '../utils/logger.js';

export async function getAIResponse(
  contactId: string,
  userMessage: string,
): Promise<string> {
  logger.debug(
    { contactId, userMessageLength: userMessage.length },
    'aiService.getAIResponse called (Phase 2 stub — returns empty string)',
  );
  return '';
}
