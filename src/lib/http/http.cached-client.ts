import { err, ok, Result, ResultAsync } from 'neverthrow';

import type { Cache } from '@/cache/cache.js';
import type { Logger } from '@/logger/logger.js';

import type { HttpClient } from './http.client.js';

type Deps = {
  baseClient: HttpClient;
  cache: Cache;
  logger: Logger;
  ttlMs: number;
};

const stringifyHeaders = Result.fromThrowable(
  (headers: Record<string, string>) => {
    const entries = Object.entries(headers)
      .map(([name, value]) => [name.toLowerCase().trim(), value.trim()] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  },
  () => 'STRINGIFY_HEADERS_ERROR' as const,
);

function getCacheKey(url: string, headers: Record<string, string>) {
  return stringifyHeaders(headers).map((h) => `http:${url}:${h}`);
}

export function createCachedHttpClient({ baseClient, cache, logger, ttlMs }: Deps): HttpClient {
  const log = logger.child({ module: 'http.cached-client' });

  return {
    httpGet(url, bodySchema, { headers = {}, timeoutMs, abortSignal } = {}) {
      const cacheKeyResult = getCacheKey(url, headers);

      return cacheKeyResult
        .asyncAndThen((cacheKey) =>
          ResultAsync.fromPromise(
            cache.get(cacheKey).then((val) => {
              if (!val) throw new Error('no value');
              return val;
            }),
            () => 'CACHE_ERROR' as const,
          ),
        )

        .andThen((cacheStr) => {
          try {
            return ok(bodySchema.parse(JSON.parse(cacheStr)));
          } catch {
            return err('BAD_CACHE');
          }
        })

        .orElse((e) => {
          log.warn({ error: e }, 'Cache read error');

          return baseClient
            .httpGet(url, bodySchema, { headers, timeoutMs, abortSignal })
            .andTee((val) => {
              const cacheKey = cacheKeyResult.unwrapOr(null);
              if (!cacheKey) return;

              const cacheStrResult = Result.fromThrowable(
                () => JSON.stringify(val),
                () => 'STRINGIFY_VAL_ERROR' as const,
              )();

              cacheStrResult
                .asyncAndThen((cacheStr) =>
                  ResultAsync.fromPromise(
                    cache.set(cacheKey, cacheStr, ttlMs),
                    () => 'CACHE_WRITE_ERROR' as const,
                  ),
                )
                .orTee((e) => {
                  log.warn({ error: e }, 'Cache write error');
                });
            });
        });
    },
  };
}
