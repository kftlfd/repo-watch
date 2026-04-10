import { asc, eq, sql } from 'drizzle-orm';
import { err, ok, ResultAsync } from 'neverthrow';

import { db } from '@/db/client.js';
import { redis } from '@/db/redis.js';
import { repositories } from '@/db/schema.js';
import { AppError, toAppError } from '@/utils/errors.js';

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export async function findById(id: number) {
  const [row] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
  return row ?? null;
}

export async function findByFullName(fullName: string) {
  const [row] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.fullName, fullName))
    .limit(1);
  return row ?? null;
}

export async function create(data: NewRepository) {
  const [row] = await db.insert(repositories).values(data).returning();
  return row;
}

export async function update(id: number, data: Partial<NewRepository>) {
  const [row] = await db
    .update(repositories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(repositories.id, id))
    .returning();
  return row ?? null;
}

export async function findBatchForScanning(limit: number) {
  return db
    .select()
    .from(repositories)
    .where(eq(repositories.isActive, true))
    .orderBy(asc(sql`${repositories.lastCheckedAt} NULLS FIRST`))
    .limit(limit);
}

const TAG_TTL_SECONDS = 600;

function getCacheKey(repoId: number): string {
  return `repo:${repoId.toString()}:latest_tag`;
}

function getCacheLatestTag(repoId: number) {
  const cacheKey = getCacheKey(repoId);
  return ResultAsync.fromPromise(redis.get(cacheKey), toAppError).andThen((val) =>
    val ? ok(val) : err({ type: 'NotFound', message: 'Cache miss' } as AppError),
  );
}

export async function setCacheLatestTag(repoId: number, tag: string) {
  const cacheKey = getCacheKey(repoId);
  await redis.setex(cacheKey, TAG_TTL_SECONDS, tag);
}

function getDBLatestTag(repoId: number) {
  return ResultAsync.fromPromise(findById(repoId), toAppError).andThen((repo) => {
    const tag = repo?.lastSeenTag;
    return tag
      ? ok(tag)
      : err({ type: 'NotFound', message: 'No tag found for repository' } as AppError);
  });
}

export function getLatestTag(repoId: number) {
  return getCacheLatestTag(repoId).orElse(() =>
    getDBLatestTag(repoId).andTee((tag) => {
      setCacheLatestTag(repoId, tag).catch((e: unknown) => {
        console.error('Cache write failed:', e);
      });
    }),
  );
}

export async function updateAfterScan(repoId: number, lastCheckedAt: Date, lastSeenTag?: string) {
  await db
    .update(repositories)
    .set({
      lastCheckedAt: lastCheckedAt,
      ...(lastSeenTag && { lastSeenTag }),
    })
    .where(eq(repositories.id, repoId));

  if (lastSeenTag) {
    await redis.set(getCacheKey(repoId), lastSeenTag).catch((err: unknown) => {
      console.error('Cache write error:', err);
    });
  }
}
