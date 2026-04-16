import OpenAI from 'openai';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// In-memory conversation history keyed by contactId.
// Trimmed to last 20 messages before each API call (10 exchanges).
const histories = new Map<string, OpenAI.Chat.ChatCompletionMessageParam[]>();

export async function getAIResponse(
  contactId: string,
  userMessage: string,
): Promise<string> {
  const history = histories.get(contactId) ?? [];
  history.push({ role: 'user', content: userMessage });

  // Trim to last 20 messages to control token cost
  const trimmed = history.slice(-20);

  logger.debug({ contactId, historyLength: trimmed.length }, 'Calling OpenAI chat.completions.create');

  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [{ role: 'system', content: env.SYSTEM_PROMPT }, ...trimmed],
  });

  const assistantText = response.choices[0]?.message?.content ?? '';
  history.push({ role: 'assistant', content: assistantText });
  histories.set(contactId, history);

  return assistantText;
}
