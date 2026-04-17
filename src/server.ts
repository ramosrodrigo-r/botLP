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
import { loadFromDisk } from './services/handoffService.js';

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

// GET /health (Phase 4 — D-02).
// Registrado ANTES do rate-limit porque o Railway health check poller chama este
// endpoint repetidamente; se estivesse após rateLimit() poderia receber 429 e
// o Railway marcaria o deploy como falho (RESEARCH.md Pitfall 2).
// Resposta mínima: { status: 'ok', uptime: <segundos desde o start do processo> }.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

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

// Phase 3 (HAND-04 / RESEARCH Pitfall 6): the paused state must be loaded from
// disk BEFORE the server accepts connections. Otherwise the first webhook
// after restart could slip past Guard 6 (isPaused) because the in-memory
// Map has not yet been populated from data/paused.json.
//
// Top-level await works because package.json has "type": "module".
await loadFromDisk();

// Phase 4 — Railway exige bind em 0.0.0.0 para o health check poller alcançar o servidor
// a partir da rede do container. Sem o host explícito, o bind depende do SO e pode ficar
// restrito a 127.0.0.1, causando "Application failed to respond" (RESEARCH.md Pitfall 1).
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started');
});

// Graceful shutdown for Railway redeploys — SIGTERM is sent before process kill.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
  });
}
