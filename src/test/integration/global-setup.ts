import { env } from '@/config/env.js';

export default async function globalSetup() {
  const { createLogger } = await import('@/logger/logger.js');
  const { createPool, createDb, applyDBMigrations } = await import('@/db/client.js');

  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);

  await applyDBMigrations(
    db,
    {
      maxAttempts: 10,
      retryDelayMs: 1_000,
    },
    createLogger(),
  );

  await pool.end();
}
