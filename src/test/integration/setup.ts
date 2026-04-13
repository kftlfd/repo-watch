import { sql } from 'drizzle-orm';
import { afterAll, beforeEach } from 'vitest';

async function clearDatabase() {
  const { db } = await import('@/db/client.js');

  await db.execute(
    sql.raw(`
    TRUNCATE TABLE
      "repo-watch_tokens",
      "repo-watch_subscriptions",
      "repo-watch_repositories"
    RESTART IDENTITY CASCADE
  `),
  );
}

async function closeIntegrationDb() {
  const { closeDB } = await import('@/db/client.js');

  await closeDB();
}

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeIntegrationDb();
});
