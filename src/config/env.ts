import { z } from 'zod';

const EnvSchema = z.object({
  // required
  SERVER_SECRET: z.string().min(1),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  // optional
  NODE_ENV: z.enum(['dev', 'test', 'prod']).catch('prod'),
  HOST: z.string().min(1).optional(),
  PORT: z.coerce.number().int().optional(),
  SERVER_BASE_URL: z.url().default('http://localhost:3000'),
  EMAIL_FROM: z.email().default('noreply@repo.watch'),
  GITHUB_TOKEN: z.string().min(1).optional(),
  METRICS_API_KEY: z.string().min(1).default('prometheus'),
});

type EnvInput = Record<keyof z.infer<typeof EnvSchema>, unknown>;

export const env = EnvSchema.parse({
  SERVER_SECRET: process.env['SERVER_SECRET'],
  DATABASE_URL: process.env['DATABASE_URL'],
  REDIS_URL: process.env['REDIS_URL'],

  NODE_ENV: process.env['NODE_ENV'],
  HOST: process.env['HOST'],
  PORT: process.env['PORT'],
  SERVER_BASE_URL: process.env['SERVER_BASE_URL'],
  EMAIL_FROM: process.env['EMAIL_FROM'],
  GITHUB_TOKEN: process.env['GITHUB_TOKEN'],
  METRICS_API_KEY: process.env['METRICS_API_KEY'],
} satisfies EnvInput);
