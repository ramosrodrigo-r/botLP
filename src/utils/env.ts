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

  // Handoff (Phase 3 — D-05, D-08, D-11)
  URGENCY_KEYWORDS: z
    .string()
    .default('preso,liminar,audiência amanhã,habeas corpus,flagrante'),

  HANDOFF_MESSAGE: z
    .string()
    .default(
      'Um de nossos advogados irá dar continuidade ao seu atendimento em breve. Obrigado pela paciência.',
    ),

  PAUSED_STATE_FILE: z
    .string()
    .default('./data/paused.json'),

  // Sandbox (Phase 4 — D-11)
  // SANDBOX_MODE=true faz o bot responder APENAS aos contactIds listados em SANDBOX_NUMBERS;
  // mensagens de demais contactIds são descartadas silenciosamente no Guard 0.
  // Usado para testar o fluxo completo no Railway com tráfego Digisac real antes do go-live (D-12).
  // Desabilitar antes de apontar Digisac para produção (gate D-13).
  SANDBOX_MODE: z
    .string()
    .default('false')
    .transform((val) => val.toLowerCase() === 'true'),
  SANDBOX_NUMBERS: z.string().default(''),

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
