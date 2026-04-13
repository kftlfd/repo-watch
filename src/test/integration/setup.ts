import { sql } from 'drizzle-orm';
import { afterAll, beforeEach } from 'vitest';

import { tableNames } from '@/db/schema.js';

async function initTestDB() {
  const { db } = await import('@/db/client.js');

  const tables = Object.values(tableNames)
    .map((t) => `"${t}"`)
    .join(', ');

  await db.execute(
    sql.raw(`
    TRUNCATE TABLE ${tables}
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
