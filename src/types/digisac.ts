/**
 * Re-export Digisac SDK types. All code imports from here, not directly from the SDK.
 * If SDK import paths change between versions, fix here only.
 *
 * CRITICAL: The SDK's MessageType union is 'chat' | 'audio' | 'ptt' | 'video' | 'image'
 * | 'document' | ... — there is no 'text' value. Text messages have type === 'chat'.
 * See RESEARCH.md Pitfall 1.
 *
 * NOTE: `Message` cannot be imported directly from `@ikatec/digisac-api-sdk` because the
 * SDK's dist/.d.ts files use extensionless relative imports, which TypeScript NodeNext
 * resolution cannot resolve. We derive `Message` from `WebhookPayload<'message.created'>.data`
 * instead — the result type is `Omit<Message, MessageRelationships>`, which includes all
 * flat fields (id, type, text, isFromMe, contactId, etc.) that handlers need.
 */
export type { WebhookPayload } from '@ikatec/digisac-api-sdk/incommingWebhooks';

import type { WebhookPayload } from '@ikatec/digisac-api-sdk/incommingWebhooks';

/** Convenience alias for the only event type we handle in Phase 1 + 2. */
export type MessageCreatedPayload = WebhookPayload<'message.created'>;

/**
 * Flat message fields available on webhook payloads (relation fields omitted).
 * Derived from WebhookPayload<'message.created'>['data'] — equivalent to
 * Omit<Message, MessageRelationships> from the SDK's internal types.
 */
export type IncomingMessage = WebhookPayload<'message.created'>['data'];
