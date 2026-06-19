import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import type { DBConfig } from '@/config/config.js';
import type { Logger } from '@/logger/logger.js';
import { defineModule } from '@/lib/runtime/runtime.js';
import { sleep } from '@/utils/sleep.js';

import * as schema from './schema.js';

export function createPool(url: string) {
  return new Pool({ connectionString: url });
}

export function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export type DB = ReturnType<typeof createDb>;

// Resolve migrations folder relative to this file's location
const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

export async function applyDBMigrations(
  db: DB,
  config: DBConfig['migrations'],
  logger: Logger,
): Promise<void> {
  logger.info({ migrationsFolder: MIGRATIONS_FOLDER }, 'Migration folder resolved');

  let attempts = 0;

  while (attempts < config.maxAttempts) {
    attempts++;

    try {
      logger.info(
        `Running migrations (attempt ${attempts.toString()}/${config.maxAttempts.toString()})...`,
      );

      await migrate(db, {
        migrationsFolder: MIGRATIONS_FOLDER,
        // Store migration tracking table in 'public' schema for visibility
        // Default is 'drizzle' schema which might not exist
        migrationsSchema: 'public',
      });

      logger.info('Migrations completed successfully');
      return;
    } catch (error) {
      logger.error({ error, attempt: attempts }, 'Migration failed');

      if (attempts >= config.maxAttempts) {
        throw new Error(
          `failed to apply migrations after ${config.maxAttempts.toString()} attempts`,
          { cause: error },
        );
      }

      logger.info(`Retrying in ${config.retryDelayMs.toString()}ms...`);
      await sleep(config.retryDelayMs);
    }
  }
}

export function createDBModule({ config, logger }: { config: DBConfig; logger: Logger }) {
  const pool = createPool(config.url);
  const db = createDb(pool);

  const dbModule = defineModule('db', {
    async start() {
      await applyDBMigrations(db, config.migrations, logger);
      await db.execute('SELECT 1;'); // test connection
    },
    async stop() {
      await pool.end();
    },
  });

  return { dbModule, db };
}
