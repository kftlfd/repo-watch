import { errAsync, okAsync } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GithubClientConfig } from '@/config/config.js';
import { createGithubRepo } from '@/test/factories.js';
import { createMockCache, createMockGithubClient, createMockLogger } from '@/test/mocks.js';
import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';

import { createCachedGithubClient } from './github.cached.js';

describe('github.cached', () => {
  const config: GithubClientConfig = {
    baseUrl: 'https://api.github.com',
    authToken: undefined,
    cacheTtlSeconds: 600,
    timeoutMs: 5_000,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached repo when available', async () => {
    const repo = createGithubRepo();
    const get = vi.fn().mockResolvedValue(JSON.stringify(repo));
    const baseGetRepo = vi.fn();
    const cache = createMockCache({
      get,
    });
    const base = createMockGithubClient({ getRepo: baseGetRepo });

    const client = createCachedGithubClient({
      config,
      base,
      cache,
      logger: createMockLogger(),
    });

    const result = await expectOkAsync(client.getRepo('owner', 'repo'));

    expect(result).toEqual(repo);
    expect(get).toHaveBeenCalledWith('gh-http:getRepo:owner/repo');
    expect(baseGetRepo).not.toHaveBeenCalled();
  });

  it('fetches from API on cache miss and stores the response', async () => {
    const repo = createGithubRepo();
    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    const baseGetRepo = vi.fn().mockReturnValue(okAsync(repo));

    const client = createCachedGithubClient({
      config,
      base: createMockGithubClient({ getRepo: baseGetRepo }),
      cache: createMockCache({ get, set }),
      logger: createMockLogger(),
    });

    const result = await expectOkAsync(client.getRepo('owner', 'repo'));

    expect(result).toEqual(repo);
    expect(baseGetRepo).toHaveBeenCalledWith('owner', 'repo');
    expect(set).toHaveBeenCalledWith('gh-http:getRepo:owner/repo', JSON.stringify(repo), 600);
  });

  it('falls back to the base client when cached repo data is invalid', async () => {
    const repo = createGithubRepo({ full_name: 'owner/repo-2' });
    const get = vi.fn().mockResolvedValue('{bad json');
    const baseGetRepo = vi.fn().mockReturnValue(okAsync(repo));

    const client = createCachedGithubClient({
      config,
      base: createMockGithubClient({ getRepo: baseGetRepo }),
      cache: createMockCache({ get, set: vi.fn().mockResolvedValue(undefined) }),
      logger: createMockLogger(),
    });

    const result = await expectOkAsync(client.getRepo('owner', 'repo'));

    expect(result).toEqual(repo);
    expect(baseGetRepo).toHaveBeenCalledWith('owner', 'repo');
  });

  it('does not cache failed base responses', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn();
    const baseError = { type: 'Unauthorized', message: 'Authentication failed' } as const;
    const baseGetRepo = vi.fn().mockReturnValue(errAsync(baseError));

    const client = createCachedGithubClient({
      config,
      base: createMockGithubClient({ getRepo: baseGetRepo }),
      cache: createMockCache({ get, set }),
      logger: createMockLogger(),
    });

    const error = await expectErrAsync(client.getRepo('owner', 'repo'));

    expect(error).toEqual(baseError);
    expect(set).not.toHaveBeenCalled();
  });

  it('returns cached latest release when available and otherwise caches the base value', async () => {
    const cacheHitClient = createCachedGithubClient({
      config,
      base: createMockGithubClient({ getLatestRelease: vi.fn() }),
      cache: createMockCache({ get: vi.fn().mockResolvedValue('v1.2.3') }),
      logger: createMockLogger(),
    });

    const hitResult = await expectOkAsync(cacheHitClient.getLatestRelease('owner', 'repo'));
    expect(hitResult).toBe('v1.2.3');

    const get = vi.fn().mockResolvedValue(null);
    const set = vi.fn().mockResolvedValue(undefined);
    const baseGetLatestRelease = vi.fn().mockReturnValue(okAsync('v2.0.0'));
    const missClient = createCachedGithubClient({
      config,
      base: createMockGithubClient({ getLatestRelease: baseGetLatestRelease }),
      cache: createMockCache({ get, set }),
      logger: createMockLogger(),
    });

    const missResult = await expectOkAsync(missClient.getLatestRelease('owner', 'repo'));

    expect(missResult).toBe('v2.0.0');
    expect(baseGetLatestRelease).toHaveBeenCalledWith('owner', 'repo');
    expect(set).toHaveBeenCalledWith('gh-http:getLatestRelease:owner/repo', 'v2.0.0', 600);
  });
});
