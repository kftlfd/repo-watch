import { err, ok, ResultAsync } from 'neverthrow';

import { redis } from '@/db/redis.js';
import * as repositoryRepo from '@/repository/repository.repo.js';
import { AppError, toAppError } from '@/utils/errors.js';

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

export async function invalidateCacheLatestTag(repoId: number) {
  const cacheKey = getCacheKey(repoId);
  await redis.del(cacheKey);
}

function getDBLatestTag(repoId: number) {
  return ResultAsync.fromPromise(repositoryRepo.findById(repoId), toAppError).andThen((repo) => {
    const tag = repo?.lastSeenTag;
    return tag
      ? ok(tag)
      : err({ type: 'NotFound', message: 'No tag found for repository' } as AppError);
  });
}

export function getLatestTag(repoId: number) {
  const cacheVal = getCacheLatestTag(repoId);

  return cacheVal.orElse(() =>
    getDBLatestTag(repoId).andTee((tag) => {
      setCacheLatestTag(repoId, tag).catch((e: unknown) => {
        console.error('Cache write failed:', e);
      });
    }),
  );
}
