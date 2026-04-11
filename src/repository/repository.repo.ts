import { eq, sql } from 'drizzle-orm';
import { err, ok, ResultAsync } from 'neverthrow';

import type { Cache } from '@/cache/cache.js';
import type { RepositoryRepoConfig } from '@/config/config.js';
import type { Logger } from '@/logger/logger.js';
import type { AppError } from '@/utils/errors.js';
import { db } from '@/db/client.js';
import { repositories } from '@/db/schema.js';
import { toAppError } from '@/utils/errors.js';

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export type RepositoryRepo = {
  create(data: NewRepository): Promise<Repository>;
  update(id: number, data: Partial<NewRepository>): Promise<Repository | null>;
  findByFullName(fullName: string): Promise<Repository | null>;
  getLatestTag(repoId: number): ResultAsync<string, AppError>;
  findBatchForScanning(limit: number): Promise<Repository[]>;
  updateAfterScan(repoId: number, lastCheckedAt: Date, lastSeenTag?: string): Promise<void>;
};

async function findById(id: number) {
  const [row] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
  return row ?? null;
}

async function findByFullName(fullName: string) {
  const [row] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.fullName, fullName))
    .limit(1);
  return row ?? null;
}

async function create(data: NewRepository) {
  const [row] = await db.insert(repositories).values(data).returning();
  if (!row) throw new Error('DB error: failed to create repository');
  return row;
}

async function update(id: number, data: Partial<NewRepository>) {
  const [row] = await db
    .update(repositories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(repositories.id, id))
    .returning();
  return row ?? null;
}

async function findBatchForScanning(limit: number) {
  return db
    .select()
    .from(repositories)
    .where(eq(repositories.isActive, true))
    .orderBy(sql`${repositories.lastCheckedAt} asc NULLS FIRST`)
    .limit(limit);
}

function getCacheKey(repoId: number): string {
  return `repo:${repoId.toString()}:latest_tag`;
}

type Deps = {
  config: RepositoryRepoConfig;
  cache: Cache;
  logger: Logger;
};

export function createRepositoryRepo({ config, cache, logger }: Deps): RepositoryRepo {
  const log = logger.child({ module: 'repository.repo' });

  function getCacheLatestTag(cacheKey: string) {
    return ResultAsync.fromPromise(cache.get(cacheKey), () => 'CACHE_ERROR' as const).andThen(
      (val) => (val ? ok(val) : err('CACHE_MISS')),
    );
  }

  async function setCacheLatestTag(cacheKey: string, tag: string) {
    await cache.set(cacheKey, tag, config.tagCacheTtlSeconds);
  }

  function getDBLatestTag(repoId: number) {
    return ResultAsync.fromPromise(findById(repoId), toAppError).andThen((repo) => {
      const tag = repo?.lastSeenTag;
      return tag
        ? ok(tag)
        : err({ type: 'NotFound', message: 'No tag found for repository' } as AppError);
    });
  }

  function getLatestTag(repoId: number) {
    const cacheKey = getCacheKey(repoId);
    return getCacheLatestTag(cacheKey).orElse(() =>
      getDBLatestTag(repoId).andTee((tag) => {
        setCacheLatestTag(cacheKey, tag).catch((error: unknown) => {
          log.warn({ error }, 'Cache write failed:');
        });
      }),
    );
  }

  async function updateAfterScan(repoId: number, lastCheckedAt: Date, lastSeenTag?: string) {
    await db
      .update(repositories)
      .set({
        lastCheckedAt: lastCheckedAt,
        ...(lastSeenTag && { lastSeenTag }),
      })
      .where(eq(repositories.id, repoId));

    if (lastSeenTag) {
      await setCacheLatestTag(getCacheKey(repoId), lastSeenTag).catch((error: unknown) => {
        log.warn({ error }, 'Cache write error:');
      });
    }
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
