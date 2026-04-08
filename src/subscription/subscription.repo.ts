import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/db/client.js';
import { subscriptions } from '@/db/schema.js';

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export async function findById(id: number) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return row ?? null;
}

export async function findActiveByEmailAndRepoId(email: string, repositoryId: number) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.email, email),
        eq(subscriptions.repositoryId, repositoryId),
        isNull(subscriptions.removedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findActiveByRepositoryId(repositoryId: number) {
  return db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.repositoryId, repositoryId), isNull(subscriptions.removedAt)));
}

export async function findConfirmedByRepositoryId(repositoryId: number) {
  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.repositoryId, repositoryId),
        isNotNull(subscriptions.confirmedAt),
        isNull(subscriptions.removedAt),
      ),
    );
}

export async function create(data: NewSubscription) {
  const [row] = await db.insert(subscriptions).values(data).returning();
  return row;
}

export async function update(id: number, data: Partial<NewSubscription>) {
  const [row] = await db
    .update(subscriptions)
    .set(data)
    .where(eq(subscriptions.id, id))
    .returning();
  return row ?? null;
}

export async function softDelete(id: number) {
  const [row] = await db
    .update(subscriptions)
    .set({ removedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning();
  return row ?? null;
}
