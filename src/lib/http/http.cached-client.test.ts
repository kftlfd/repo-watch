import { errAsync, okAsync } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';

import { createMockCache, createMockLogger } from '@/test/mocks.js';
import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';
import { httpErrors } from '@/utils/html.js';

import { createCachedHttpClient } from './http.cached-client.js';

describe('http.cached-client', () => {
  const URL = 'http://localhost:8088';
  const body = 'ok';
  const bodySchema = z.string();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached data when available', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify(body));
    const cache = createMockCache({ get });
    const httpGet = vi.fn();

    const client = createCachedHttpClient({
      baseClient: { httpGet },
      cache,
      logger: createMockLogger(),
      ttlMs: 1_000,
    });

    const result = await expectOkAsync(client.httpGet(URL, bodySchema));

    expect(result).toEqual(body);
    expect(get).toHaveBeenCalled();
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('fetches from API on cache miss and stores the response', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    const httpGet = vi.fn().mockReturnValue(okAsync(body));

    const client = createCachedHttpClient({
      baseClient: { httpGet },
      cache: createMockCache({ get, set }),
      logger: createMockLogger(),
      ttlMs: 1_000,
    });

    const result = await expectOkAsync(client.httpGet(URL, bodySchema));

    expect(result).toEqual(body);
    expect(httpGet).toHaveBeenCalled();
    expect(set).toHaveBeenCalled();
  });

  it('falls back to the base client when cached data is invalid', async () => {
    const get = vi.fn().mockResolvedValue('{bad json');
    const set = vi.fn().mockResolvedValue(undefined);
    const httpGet = vi.fn().mockReturnValue(okAsync(body));

    const client = createCachedHttpClient({
      baseClient: { httpGet },
      cache: createMockCache({ get, set }),
      logger: createMockLogger(),
      ttlMs: 1_000,
    });

    const result = await expectOkAsync(client.httpGet(URL, bodySchema));

    expect(result).toEqual(body);
    expect(httpGet).toHaveBeenCalled();
    expect(set).toHaveBeenCalled();
  });

  it('does not cache failed base responses', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn();
    const httpGet = vi.fn().mockReturnValue(errAsync(httpErrors.Unknown(503)));

    const client = createCachedHttpClient({
      baseClient: { httpGet },
      cache: createMockCache({ get, set }),
      logger: createMockLogger(),
      ttlMs: 1_000,
    });

    const error = await expectErrAsync(client.httpGet(URL, bodySchema));

    expect(error.type === 'HTTP_ERROR');
    expect(set).not.toHaveBeenCalled();
  });
});
