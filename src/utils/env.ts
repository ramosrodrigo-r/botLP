import 'dotenv/config';
import { z } from 'zod';

/**
 * Env schema. Validated at module load — import this file first in server.ts.
 * Implements OBS-02: fail fast with clear error on missing/malformed env vars.
 * Implements D-02: compliance texts are env vars, not hardcoded.
 */
const EnvSchema = z.object({
  // Digisac (per D-01, D-08)
  DIGISAC_API_URL: z.string().url(),
  DIGISAC_API_TOKEN: z.string().min(1),
  DIGISAC_SERVICE_ID: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(16, 'WEBHOOK_SECRET must be at least 16 characters (entropy requirement)'),

  // OpenAI (validated now even though AI pipeline is Phase 2 — fail-fast per OBS-02)
  OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY must start with sk-'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_FALLBACK_MESSAGE: z
    .string()
    .default(
      'No momento estou com dificuldades técnicas para responder. ' +
      'Um de nossos atendentes entrará em contato em breve.',
    ),

  // Compliance texts (D-02, D-03 — placeholder values in .env.example, stakeholder review before production)
  DISCLOSURE_MESSAGE: z.string().min(1),
  LGPD_CONSENT_MESSAGE: z.string().min(1),
  LEGAL_DISCLAIMER: z.string().min(1),
  SYSTEM_PROMPT: z.string().min(1),

  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const result = EnvSchema.safeParse(process.env);
if (!result.success) {
  console.error('FATAL: Invalid environment configuration:');
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
