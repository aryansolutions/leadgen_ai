
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(currentDirectory, '../../../.env'),
});

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().url().optional().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.string().default('false'),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.string().default('true'),
  DATABASE_SSL_CA_PATH: z.string().optional().default(''),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('12h'),
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),

  // Gemini AI intelligence
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(16).max(256).default(60),

  // Existing OpenAI configuration retained
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime-2.1-mini'),

  CALLING_ENABLED: z.string().default('false'),

  // Exotel
  EXOTEL_ACCOUNT_SID: z.string().optional().default(''),
  EXOTEL_API_KEY: z.string().optional().default(''),
  EXOTEL_API_TOKEN: z.string().optional().default(''),
  EXOTEL_SUBDOMAIN: z.string().default('api.exotel.com'),
  EXOTEL_CALLER_ID: z.string().optional().default(''),
  EXOTEL_WEBHOOK_SECRET: z.string().optional().default(''),

  // Sarvam STT and TTS
  SARVAM_API_KEY: z.string().optional().default(''),
  SARVAM_STT_MODEL: z.string().default('saaras:v4'),
  SARVAM_LLM_MODEL: z.string().default('deepseek-v4.1-flash-1017'),
  SARVAM_TTS_MODEL: z.string().default('bulbul:v4-flash'),
  SARVAM_TTS_SAMPLE_RATE: z.coerce.number().default(8000),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    'Invalid environment configuration:',
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,

  DATABASE_SSL: parsed.data.DATABASE_SSL === 'true',

  DATABASE_SSL_REJECT_UNAUTHORIZED:
    parsed.data.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',

  CALLING_ENABLED: parsed.data.CALLING_ENABLED === 'true',
};
