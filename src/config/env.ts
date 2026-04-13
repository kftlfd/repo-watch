import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['dev', 'test', 'prod']).catch('prod'),
  HOST: z.string().min(1).optional(),
  PORT: z.coerce.number().int().optional(),
  DATABASE_URL: z.url().min(1),
  REDIS_URL: z.url().min(1),
  GITHUB_TOKEN: z.string().min(1).optional().catch(undefined),
  BASE_URL: z.url().optional().default('http://localhost:3000'),
  EMAIL_FROM: z.email().optional().default('noreply@example.com'),
  SERVER_SECRET: z.string().min(1),
});

type EnvInput = Record<keyof z.infer<typeof EnvSchema>, unknown>;

export const env = EnvSchema.parse({
  NODE_ENV: process.env['NODE_ENV'],
  HOST: process.env['HOST'],
  PORT: process.env['PORT'],
  DATABASE_URL: process.env['DATABASE_URL'],
  REDIS_URL: process.env['REDIS_URL'],
  GITHUB_TOKEN: process.env['GITHUB_TOKEN'],
  BASE_URL: process.env['BASE_URL'],
  EMAIL_FROM: process.env['EMAIL_FROM'],
  SERVER_SECRET: process.env['SERVER_SECRET'],
} satisfies EnvInput);
