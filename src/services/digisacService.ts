/**
 * Digisac SDK wrapper — sends outbound messages with mandatory `origin: 'bot'`.
 *
 * DEVIATION NOTE: The SDK's dist/.d.ts files use extensionless relative imports
 * (e.g. `export * from './core'`) which TypeScript NodeNext resolution cannot
 * resolve. Using `import { BaseApiClient }` produces TS2305 even though the
 * runtime values exist. To keep NodeNext strict mode and pass `tsc --noEmit`,
 * we load the SDK via `createRequire` (the ESM-legal escape hatch from Node's
 * built-in `module` package). The runtime behavior is identical to the old
 * bare require() shim — both resolve to the SDK's CJS bundle — but
 * `createRequire` is valid ESM and does not throw `ReferenceError: require is
 * not defined` at startup.
 */
import { createRequire } from 'module';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

/** Minimal interface covering the fields `MessagesApi.create` actually uses. */
interface CreateMessagePayload {
  contactId: string;
  text: string;
  serviceId: string;
  origin: 'bot' | 'user';
}

interface IMessagesApi {
  create(payload: CreateMessagePayload): Promise<unknown>;
}

interface IBaseApiClient {
  // opaque — only passed to MessagesApi constructor
}

const _require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { BaseApiClient } = _require('@ikatec/digisac-api-sdk') as {
  BaseApiClient: new (url: string, token: string) => IBaseApiClient;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { MessagesApi } = _require('@ikatec/digisac-api-sdk/apis') as {
  MessagesApi: new (client: IBaseApiClient) => IMessagesApi;
};

/**
 * Module-level singletons. Never instantiate per-call.
 * Per CLAUDE.md: NEVER use axios or node-fetch — the SDK uses native fetch internally.
 */
const apiClient = new BaseApiClient(env.DIGISAC_API_URL, env.DIGISAC_API_TOKEN);
const messagesApi = new MessagesApi(apiClient);

/**
 * Send a text message to a lead via Digisac.
 *
 * `origin: 'bot'` is MANDATORY — it marks the message as bot-sent so that the
 * resulting `message.created` webhook (which will have isFromMe === true) is
 * filtered by the webhookHandler guard chain. Without this field the bot can
 * respond to its own messages and create an infinite loop (CLAUDE.md constraint).
 *
 * Throws on API error. Callers are responsible for catching — in the async
 * pipeline started from setImmediate the top-level .catch handler logs the error.
 */
export async function sendMessage(contactId: string, text: string): Promise<void> {
  const log = logger.child({ contactId, direction: 'outbound' });
  log.debug({ textLength: text.length }, 'sending message via Digisac');

  await messagesApi.create({
    contactId,
    text,
    serviceId: env.DIGISAC_SERVICE_ID,
    origin: 'bot',
  });

  log.info('message sent');
}
