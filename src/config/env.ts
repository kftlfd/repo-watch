import 'dotenv/config';

export const env = {
  NODE_ENV: process.env['NODE_ENV'] === 'dev' ? ('dev' as const) : ('prod' as const),
  DATABASE_URL: process.env['DATABASE_URL'] ?? '',
  REDIS_URL: process.env['REDIS_URL'] ?? '',
  GITHUB_TOKEN: process.env['GITHUB_TOKEN'] ?? '',
  BASE_URL: process.env['BASE_URL'] ?? 'http://localhost:3000',
  EMAIL_FROM: process.env['EMAIL_FROM'] ?? 'noreply@example.com',
};
