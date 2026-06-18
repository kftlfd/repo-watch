import { eq, sql } from 'drizzle-orm';
import { err, ok, ResultAsync } from 'neverthrow';

import type { Cache } from '@/cache/cache.js';
import type { RepositoryRepoConfig } from '@/config/config.js';
import type { DB } from '@/db/client.js';
import type { Logger } from '@/logger/logger.js';
import { dbErrors } from '@/db/errors.js';
import { repositories } from '@/db/schema.js';

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export type RepositoryRepo = ReturnType<typeof createRepositoryRepo>;

type Deps = {
  db: DB;
  config: RepositoryRepoConfig;
  cache: Cache;
  logger: Logger;
};

export function createRepositoryRepo({ db, config, cache, logger }: Deps) {
  const log = logger.child({ module: 'repository.repo' });
  const ENTITY = 'Repo';

  function create(data: NewRepository) {
    return ResultAsync.fromPromise(db.insert(repositories).values(data).returning(), (e) =>
      dbErrors.DBError(e),
    ).andThen(([row]) =>
      row ? ok(row) : err(dbErrors.DBError(new Error(`${ENTITY} not created`))),
    );
  }

  function update(id: number, data: Partial<NewRepository>) {
    return ResultAsync.fromPromise(
      db
        .update(repositories)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(repositories.id, id))
        .returning(),
      (e) => dbErrors.DBError(e),
    ).andThen(([row]) => (row ? ok(row) : err(dbErrors.DBNotFound(ENTITY, { id }))));
  }

  function findByFullName(fullName: string) {
    return ResultAsync.fromPromise(
      db.select().from(repositories).where(eq(repositories.fullName, fullName)).limit(1),
      (e) => dbErrors.DBError(e),
    ).andThen(([row]) => (row ? ok(row) : err(dbErrors.DBNotFound(ENTITY, { fullName }))));
  }

  function getCacheKey(repoId: number) {
    return `repo:${repoId.toString()}:latest_tag`;
  }

  function getCacheLatestTag(cacheKey: string) {
    return ResultAsync.fromPromise(cache.get(cacheKey), () => 'CACHE_ERROR' as const).andThen(
      (val) => (val ? ok(val) : err('CACHE_MISS')),
    );
  }

  function setCacheLatestTag(cacheKey: string, tag: string) {
    return ResultAsync.fromSafePromise(
      cache.set(cacheKey, tag, config.tagCacheTtlSeconds).catch((error: unknown) => {
        log.warn({ error }, 'Cache write error:');
      }),
    );
  }

  function findById(id: number) {
    return ResultAsync.fromPromise(
      db.select().from(repositories).where(eq(repositories.id, id)).limit(1),
      (e) => dbErrors.DBError(e),
    ).andThen(([row]) => (row ? ok(row) : err(dbErrors.DBNotFound(ENTITY, { id }))));
  }

  function getDBLatestTag(repoId: number) {
    return findById(repoId).andThen(({ lastSeenTag }) =>
      lastSeenTag ? ok(lastSeenTag) : err(dbErrors.DBNotFound(ENTITY, { id: repoId })),
    );
  }

  function getLatestTag(repoId: number) {
    const cacheKey = getCacheKey(repoId);
    return getCacheLatestTag(cacheKey).orElse(() =>
      getDBLatestTag(repoId).andTee((tag) => setCacheLatestTag(cacheKey, tag)),
    );
  }

  function findBatchForScanning(limit: number) {
    return ResultAsync.fromPromise(
      db
        .select()
        .from(repositories)
        .where(eq(repositories.isActive, true))
        .orderBy(sql`${repositories.lastCheckedAt} asc NULLS FIRST`)
        .limit(limit),
      (e) => dbErrors.DBError(e),
    );
  }

  function updateRowAfterScan(repoId: number, lastCheckedAt: Date, lastSeenTag?: string) {
    return ResultAsync.fromPromise(
      db
        .update(repositories)
        .set({
          lastCheckedAt: lastCheckedAt,
          ...(lastSeenTag && { lastSeenTag }),
        })
        .where(eq(repositories.id, repoId))
        .returning(),
      (e) => dbErrors.DBError(e),
    ).andThen(([row]) => (row ? ok(row) : err(dbErrors.DBNotFound(ENTITY, { id: repoId }))));
  }

  function updateAfterScan(repoId: number, lastCheckedAt: Date, lastSeenTag?: string) {
    return updateRowAfterScan(repoId, lastCheckedAt, lastSeenTag).andThen((repo) =>
      repo.lastSeenTag ? setCacheLatestTag(getCacheKey(repoId), repo.lastSeenTag) : ok(),
    );
  }

  return {
    create,
    update,
    findByFullName,
    getLatestTag,
    findBatchForScanning,
    updateAfterScan,
  };
}
