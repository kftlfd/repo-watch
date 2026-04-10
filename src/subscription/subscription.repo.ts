import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/db/client.js';
import { repositories, subscriptions } from '@/db/schema.js';

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type SubscriptionsListItem = {
  email: string;
  repo: string;
  confirmed: boolean;
  last_seen_tag: string | null;
};

export type SubscriptionRepo = {
  create(data: NewSubscription): Promise<Subscription>;
  update(id: number, data: Partial<NewSubscription>): Promise<Subscription | null>;
  softDelete(id: number): Promise<Subscription | null>;
  findActiveByEmailAndRepoId(email: string, repositoryId: number): Promise<Subscription | null>;
  getConfirmedByRepositoryIdBatch(
    repositoryId: number,
    cursor: number,
    batchSize: number,
  ): Promise<Subscription[]>;
  getSubscriptionsForEmail(email: string): Promise<SubscriptionsListItem[]>;
};

async function findActiveByEmailAndRepoId(email: string, repositoryId: number) {
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

async function getConfirmedByRepositoryIdBatch(
  repositoryId: number,
  cursor: number,
  batchSize: number,
) {
  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.repositoryId, repositoryId),
        isNotNull(subscriptions.confirmedAt),
        isNull(subscriptions.removedAt),
        gt(subscriptions.id, cursor),
      ),
    )
    .orderBy(subscriptions.id)
    .limit(batchSize);
}

async function create(data: NewSubscription) {
  const [row] = await db.insert(subscriptions).values(data).returning();
  if (!row) throw new Error('DB error: failed to create subscription');
  return row;
}

async function update(id: number, data: Partial<NewSubscription>) {
  const [row] = await db
    .update(subscriptions)
    .set(data)
    .where(eq(subscriptions.id, id))
    .returning();
  return row ?? null;
}

async function softDelete(id: number) {
  const [row] = await db
    .update(subscriptions)
    .set({ removedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning();
  return row ?? null;
}

async function getSubscriptionsForEmail(email: string): Promise<SubscriptionsListItem[]> {
  const rows = await db
    .select({
      subscription: subscriptions,
      repository: repositories,
    })
    .from(subscriptions)
    .innerJoin(repositories, eq(subscriptions.repositoryId, repositories.id))
    .where(and(eq(subscriptions.email, email), isNull(subscriptions.removedAt)));

  return rows.map((row) => ({
    email: row.subscription.email,
    repo: row.repository.fullName,
    confirmed: row.subscription.confirmedAt !== null,
    last_seen_tag: row.repository.lastSeenTag,
  }));
}

export function createSubscriptionRepo(): SubscriptionRepo {
  return {
    create,
    update,
    softDelete,
    findActiveByEmailAndRepoId,
    getConfirmedByRepositoryIdBatch,
    getSubscriptionsForEmail,
  };
}
