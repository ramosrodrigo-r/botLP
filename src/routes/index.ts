import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { handleWebhookAsync } from '../handlers/webhookHandler.js';

/**
 * Constant-time token comparison (WBHK-02).
 *
 * `crypto.timingSafeEqual` THROWS RangeError if the two buffers differ in length
 * — this is intentional design to prevent length-based timing attacks. The
 * try/catch prevents an attacker from distinguishing "wrong length" vs "wrong
 * content" via error-shape. Both map to `false`. (RESEARCH.md Pitfall 2.)
 */
function validateToken(incoming: string | undefined, expected: string): boolean {
  if (!incoming) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected));
  } catch {
    return false;
  }
}

const router = Router();

/**
 * POST /digisac/webhook?token=<WEBHOOK_SECRET>
 *
 * Per D-01: token is a QUERY PARAM (not header). Digisac is configured with
 * the full URL including `?token=`.
 *
 * Response discipline (WBHK-01, RESEARCH.md Pitfall 3):
 *   - 401 ONLY on token validation failure (security rejection, not filter).
 *   - 200 for everything else, INCLUDING events we intentionally discard.
 *     Digisac treats any non-200 as "delivery failed" and retries, which
 *     floods the server with duplicates.
 *
 * Response is sent synchronously BEFORE setImmediate dispatches async work.
 * This keeps the HTTP round-trip under Digisac's webhook timeout.
 */
router.post('/digisac/webhook', (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : undefined;

  if (!validateToken(token, env.WEBHOOK_SECRET)) {
    logger.warn({ ip: req.ip }, 'webhook rejected: invalid token');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // WBHK-01: respond to Digisac immediately — BEFORE any async processing.
  res.status(200).json({ received: true });

  // Fire-and-forget: decouple HTTP response from downstream work.
  // Errors here MUST be caught; setImmediate callbacks are outside Express's
  // error handler scope (Express 5's native async handling covers route
  // handlers only).
  setImmediate(() => {
    handleWebhookAsync(req.body).catch((err: unknown) => {
      logger.error({ err }, 'unhandled webhook processing error');
    });
  });
});

export default router;
