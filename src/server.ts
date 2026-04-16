/**
 * Entry point.
 *
 * The FIRST import MUST be './utils/env.js' — this triggers Zod validation of
 * process.env at module load, before any other module reads env vars. Server
 * fails fast (process.exit(1)) with a clear error if env is invalid (OBS-02).
 */
import './utils/env.js';

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './utils/env.js';
import { logger, httpLogger } from './utils/logger.js';
import router from './routes/index.js';

const app = express();

/**
 * Middleware chain (order is intentional):
 *   1. helmet()           — HTTP security headers (OWASP defaults)
 *   2. rateLimit()        — WBHK-05: 60 req/min per IP. Applied globally.
 *                           In-process store; Map-based; no Redis (v1 scale).
 *   3. express.json()     — body parsing. Runs after security so malformed
 *                           requests are rejected before we allocate for JSON.
 *   4. httpLogger         — pino-http request logging. Runs after json() so
 *                           it can log parsed body sizes when relevant.
 *   5. router             — POST /digisac/webhook and anything else added.
 *
 * Express 5 handles async errors in route handlers natively — no
 * express-async-errors package needed (CLAUDE.md constraint).
 */
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 60_000, // 1 minute window
    max: 60,          // 60 requests/min per IP (WBHK-05)
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(express.json());
app.use(httpLogger);

app.use('/', router);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started');
});

// Graceful shutdown for Railway redeploys — SIGTERM is sent before process kill.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
  });
}
