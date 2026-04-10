import { err, ok, ResultAsync } from 'neverthrow';

import type { Cache } from '@/cache/cache.js';
import type { GithubClientConfig } from '@/config/config.js';

import type { GithubClient } from './github.client.js';
import { RepoSchema } from './github.schema.js';

type Deps = {
  config: GithubClientConfig;
  base: GithubClient;
  cache: Cache;
};

function getCacheKey(request: string, repoId: string): string {
  return `gh-http:${request}:${repoId}`;
}

export function createCachedGithubClient({ config, base, cache }: Deps): GithubClient {
  return {
    getRepo(owner, name) {
      const cacheKey = getCacheKey('getRepo', `${owner}/${name}`);

      const cacheVal = ResultAsync.fromPromise(cache.get(cacheKey), () => 'CACHE_ERROR' as const)
        .andThen((val) => (val ? ok(val) : err('CACHE_MISS')))
        .andThen((data) => {
          try {
            return ok(RepoSchema.parse(JSON.parse(data)));
          } catch {
            return err('BAD_CACHE');
          }
        });

      return cacheVal.orElse(() =>
        base.getRepo(owner, name).andTee((val) => {
          cache
            .set(cacheKey, JSON.stringify(val), config.cacheTtlSeconds)
            .catch((error: unknown) => {
              console.error('Cache write error:', error);
            });
        }),
      );
    },

    getLatestRelease(owner, name) {
      const cacheKey = getCacheKey('getLatestRelease', `${owner}/${name}`);

      const cacheVal = ResultAsync.fromPromise(
        cache.get(cacheKey),
        () => 'CACHE_ERROR' as const,
      ).andThen((val) => (val ? ok(val) : err('CACHE_MISS')));

      return cacheVal.orElse(() =>
        base.getLatestRelease(owner, name).andTee((val) => {
          cache.set(cacheKey, val, config.cacheTtlSeconds).catch((error: unknown) => {
            console.error('Cache write error:', error);
          });
        }),
      );
    },
  };
}
