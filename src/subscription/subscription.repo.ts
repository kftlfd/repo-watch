import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { err, ok, ResultAsync } from 'neverthrow';

import type { DB } from '@/db/client.js';
import { dbErrors } from '@/db/errors.js';
import { repositories, subscriptions } from '@/db/schema.js';

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type SubscriptionsListItem = {
  email: string;
  repo: string;
  confirmed: boolean;
  last_seen_tag: string | null;
};

export type SubscriptionRepo = ReturnType<typeof createSubscriptionRepo>;

type Deps = {
  db: DB;
};

export function createSubscriptionRepo({ db }: Deps) {
  const ENTITY = 'subscription';

  function findActiveByEmailAndRepoId(email: string, repositoryId: number) {
    return ResultAsync.fromPromise(
      db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.email, email),
            eq(subscriptions.repositoryId, repositoryId),
            isNull(subscriptions.removedAt),
          ),
        )
        .limit(1),
      (e) => dbErrors.DBError(e),
    ).andThen(([row]) => (row ? ok(row) : err(dbErrors.DBNotFound(ENTITY))));
  }

  function getConfirmedByRepositoryIdBatch(
    repositoryId: number,
    cursor: number,
    batchSize: number,
  ) {
    return ResultAsync.fromPromise(
      db
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
        .limit(batchSize),
      (e) => dbErrors.DBError(e),
    );
  }

  function create(data: NewSubscription) {
    return ResultAsync.fromPromise(db.insert(subscriptions).values(data).returning(), (e) =>
      dbErrors.DBError(e),
    ).andThen(([row]) =>
      row ? ok(row) : err(dbErrors.DBError(new Error(`${ENTITY} not created`))),
    );
  }

  function update(id: number, data: Partial<NewSubscription>) {
    return ResultAsync.fromPromise(
      db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning(),
      (e) => dbErrors.DBError(e),
    ).andThen(([row]) =>
      row ? ok(row) : err(dbErrors.DBError(new Error(`${ENTITY} not returned after update`))),
    );
  }

  function softDelete(id: number) {
    return ResultAsync.fromPromise(
      db
        .update(subscriptions)
        .set({ removedAt: new Date() })
        .where(eq(subscriptions.id, id))
        .returning(),
      (e) => dbErrors.DBError(e),
    ).andThen(([row]) =>
      row ? ok(row) : err(dbErrors.DBError(new Error(`${ENTITY} not returned after soft delete`))),
    );
  }

  function getSubscriptionsForEmail(email: string) {
    return ResultAsync.fromPromise(
      db
        .select({
          subscription: subscriptions,
          repository: repositories,
        })
        .from(subscriptions)
        .innerJoin(repositories, eq(subscriptions.repositoryId, repositories.id))
        .where(and(eq(subscriptions.email, email), isNull(subscriptions.removedAt))),
      (e) => dbErrors.DBError(e),
    ).map((rows) =>
      rows.map<SubscriptionsListItem>((row) => ({
        email: row.subscription.email,
        repo: row.repository.fullName,
        confirmed: row.subscription.confirmedAt !== null,
        last_seen_tag: row.repository.lastSeenTag,
      })),
    );
  }

  return {
    create,
    update,
    softDelete,
    findActiveByEmailAndRepoId,
    getConfirmedByRepositoryIdBatch,
    getSubscriptionsForEmail,
  };
}
