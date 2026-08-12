import { describe, it, vi } from 'vitest';

import { createConfig } from '@/config/config.js';
import { createHttpClient } from '@/lib/http/http.client.js';
import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';

import { createGithubClient } from './github.client.js';

describe('github.client (integration)', () => {
  const client = createGithubClient({
    httpClient: createHttpClient(),
    config: createConfig().githubClient,
    metrics: {
      onError: vi.fn(),
      onRateLimitError: vi.fn(),
    },
  });

  it('fetches and parses repo info', async () => {
    await expectOkAsync(client.getRepo('torvalds', 'linux'));
  });

  it('fetches and parses repo tag', async () => {
    await expectOkAsync(client.getLatestRelease('torvalds', 'linux'));
  });

  it('returns errors for non-existent repos', async () => {
    await expectErrAsync(client.getRepo('kftlfd', 'non-existent-repo'));
    await expectErrAsync(client.getLatestRelease('kftlfd', 'non-existent-repo'));
  });
});
