import type { DB } from '@/db/client.js';
import { repositories, subscriptions, tokens } from '@/db/schema.js';

export async function seedRepository(
  db: DB,
  overrides: Partial<typeof repositories.$inferInsert> = {},
) {
  const [row] = await db
    .insert(repositories)
    .values({
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      isActive: true,
      ...overrides,
    })
    .returning();

  if (!row) {
    throw new Error('Failed to seed repository');
  }

  return row;
}

export async function seedSubscription(
  db: DB,
  overrides: Partial<typeof subscriptions.$inferInsert> = {},
) {
  const [row] = await db
    .insert(subscriptions)
    .values({
      email: 'user@example.com',
      repositoryId: 1,
      ...overrides,
    })
    .returning();

  if (!row) {
    throw new Error('Failed to seed subscription');
  }

  return row;
}

export async function seedToken(db: DB, overrides: Partial<typeof tokens.$inferInsert> = {}) {
  const [row] = await db
    .insert(tokens)
    .values({
      tokenHash: 'hashed-token',
      email: 'user@example.com',
      repositoryId: 1,
      type: 'confirm',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      ...overrides,
    })
    .returning();

  if (!row) {
    throw new Error('Failed to seed token');
  }

  return row;
}
