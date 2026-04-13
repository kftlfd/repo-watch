import { sql } from 'drizzle-orm';
import { afterAll, beforeEach } from 'vitest';

async function initTestDB() {
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

async function closeTestDB() {
  const { closeDB } = await import('@/db/client.js');

  await closeDB();
}

beforeEach(async () => {
  await initTestDB();
});

afterAll(async () => {
  await closeTestDB();
});
