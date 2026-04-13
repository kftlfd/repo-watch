export default async function globalSetup() {
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
