import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import type { MigrationConfig } from '@/config/config.js';
import type { Logger } from '@/logger/logger.js';
import { env } from '@/config/env.js';
import { sleep } from '@/utils/sleep.js';

import * as schema from './schema.js';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function closeDB() {
  return pool.end();
}

// Resolve migrations folder relative to this module's location
const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

export async function applyDBMigrations(config: MigrationConfig, logger: Logger): Promise<void> {
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
          `Failed to apply migrations after ${config.maxAttempts.toString()} attempts`,
          { cause: error },
        );
      }

      logger.info(`Retrying in ${config.retryDelayMs.toString()}ms...`);
      await sleep(config.retryDelayMs);
    }
  }
}
