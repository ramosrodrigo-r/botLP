import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from './env.js';

/**
 * Module-level pino singleton.
 * - Production: JSON output (Railway log viewer + future aggregators consume JSON)
 * - Non-production: pino-pretty transport for human-readable dev output
 *
 * Per OBS-01: use `logger.child({ contactId, messageId, requestId })` in handlers
 * to bind request-scoped context — never mutate the root logger.
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty' },
  }),
});

/**
 * pino-http middleware — attach as Express middleware in server.ts.
 * Auto-logs method, URL, status, response time per request.
 * Exposes `req.log` child logger to downstream route handlers.
 */
export const httpLogger = pinoHttp({ logger });
