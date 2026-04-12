import { sql } from 'drizzle-orm';
import { afterAll, beforeEach } from 'vitest';

import { ensureIntegrationTestEnv } from './env.js';

async function clearDatabase() {
  ensureIntegrationTestEnv();

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
  ensureIntegrationTestEnv();

  const { closeDB } = await import('@/db/client.js');

  await closeDB();
}

ensureIntegrationTestEnv();

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeIntegrationDb();
});
