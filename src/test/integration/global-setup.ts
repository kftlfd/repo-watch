import { ensureIntegrationTestEnv } from './env.js';

export default async function globalSetup() {
  ensureIntegrationTestEnv();

  const [{ createLogger }, { applyDBMigrations, closeDB }] = await Promise.all([
    import('@/logger/logger.js'),
    import('@/db/client.js'),
  ]);

  await applyDBMigrations(
    {
      maxAttempts: 3,
      retryDelayMs: 2_000,
    },
    createLogger(),
  );

  await closeDB();
}
