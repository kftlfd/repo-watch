import type { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import type { DB } from '@/db/client.js';
import { env } from '@/config/env.js';
import { createDb, createPool } from '@/db/client.js';
import { tableNames } from '@/db/schema.js';

export let db: DB;
let pool: Pool;

const tables = Object.values(tableNames)
  .map((t) => `"${t}"`)
  .join(', ');

async function resetDB(db: DB) {
  await db.execute(
    sql.raw(`
    TRUNCATE TABLE ${tables}
    RESTART IDENTITY CASCADE
  `),
  );
}

beforeAll(() => {
  pool = createPool(env.DATABASE_URL);
  db = createDb(pool);
});

beforeEach(async () => {
  await resetDB(db);
});

afterAll(async () => {
  await pool.end();
});
