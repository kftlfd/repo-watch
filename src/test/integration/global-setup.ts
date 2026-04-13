export default async function globalSetup() {
  const { createLogger } = await import('@/logger/logger.js');
  const { applyDBMigrations, closeDB } = await import('@/db/client.js');

  await applyDBMigrations(
    {
      maxAttempts: 10,
      retryDelayMs: 1_000,
    },
    createLogger(),
  );

  await closeDB();
}
