import { sql } from 'drizzle-orm';
import { index, pgTableCreator, uniqueIndex } from 'drizzle-orm/pg-core';

const pgTable = pgTableCreator((name) => `repo-watch_${name}`);

export const repositories = pgTable(
  'repositories',
  (pg) => ({
    id: pg.serial('id').primaryKey(),
    owner: pg.text('owner').notNull(),
    name: pg.text('name').notNull(),
    fullName: pg.text('full_name').notNull().unique(),
    lastSeenTag: pg.text('last_seen_tag'),
    lastCheckedAt: pg.timestamp('last_checked_at'),
    isActive: pg.boolean('is_active').default(true).notNull(),
    createdAt: pg.timestamp('created_at').defaultNow().notNull(),
    updatedAt: pg.timestamp('updated_at').defaultNow().notNull(),
  }),
  (table) => [
    index('repositories_last_checked_at_idx').on(table.lastCheckedAt),
    index('repositories_is_active_idx').on(table.isActive),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  (pg) => ({
    id: pg.serial('id').primaryKey(),
    email: pg.text('email').notNull(),
    repositoryId: pg
      .serial('repository_id')
      .notNull()
      .references(() => repositories.id),
    confirmedAt: pg.timestamp('confirmed_at'),
    removedAt: pg.timestamp('removed_at'),
    createdAt: pg.timestamp('created_at').defaultNow().notNull(),
  }),
  (table) => [
    index('subscriptions_repository_id_idx').on(table.repositoryId),
    uniqueIndex('subscriptions_email_repository_id_active_idx')
      .on(table.email, table.repositoryId)
      .where(sql`${table.removedAt} IS NULL`),
  ],
);

export const tokens = pgTable(
  'tokens',
  (pg) => ({
    id: pg.serial('id').primaryKey(),
    tokenHash: pg.text('token_hash').notNull().unique(),
    email: pg.text('email').notNull(),
    repositoryId: pg.serial('repository_id').references(() => repositories.id),
    type: pg.text('type').notNull(), // 'confirm' | 'unsubscribe'
    expiresAt: pg.timestamp('expires_at').notNull(),
    createdAt: pg.timestamp('created_at').defaultNow().notNull(),
  }),
  (table) => [
    index('tokens_token_hash_idx').on(table.tokenHash),
    index('tokens_expires_at_idx').on(table.expiresAt),
  ],
);
