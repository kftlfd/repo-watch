import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';
import { sleep } from '@/utils/sleep.js';

import { createGithubClient } from './github.client.js';

describe('github.client abort signals', () => {
  const BASE_URL = 'http://localhost:8088';

  function createGhClient(timeoutMs: number) {
    return createGithubClient({
      config: {
        baseUrl: BASE_URL,
        authToken: undefined,
        cacheTtlSeconds: 600,
        timeoutMs,
      },
      metrics: {
        onError: vi.fn(),
        onRateLimitError: vi.fn(),
      },
    });
  }

  const owner = 'torvalds';
  const name = 'linux';
  const repo = {
    full_name: 'torvalds/linux',
    owner: { login: 'torvalds' },
    name: 'linux',
  };

  const msw = setupServer(
    http.get(`${BASE_URL}/repos/${owner}/${name}`, async () => {
      await sleep(1_000);
      return HttpResponse.json(repo);
    }),
  );

  beforeAll(() => {
    msw.listen();
    vi.useFakeTimers();
  });

  afterAll(() => {
    msw.close();
    vi.useRealTimers();
  });

  it('parses OK response', async () => {
    const gh = createGhClient(2_000);

    const result = gh.getRepo(owner, name);

    await vi.advanceTimersByTimeAsync(1_100);

    await expectOkAsync(result);
  });

  it('returns timeout error result', async () => {
    const gh = createGhClient(200);

    const result = gh.getRepo(owner, name);

    await vi.advanceTimersByTimeAsync(400);

    const error = await expectErrAsync(result);
    expect(error.type === 'TIMEOUT');
  });

  it('returns abort error result', async () => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 300);

    const gh = createGhClient(1_000);

    const result = gh.getRepo(owner, name, controller.signal);

    await vi.advanceTimersByTimeAsync(400);

    const error = await expectErrAsync(result);
    expect(error.type === 'ABORTED');
  });

  it('returns first timeout/abort error result', async () => {
    const gh = createGhClient(300);

    const controller1 = new AbortController();
    setTimeout(() => {
      controller1.abort();
    }, 400);

    const result1 = gh.getRepo(owner, name, controller1.signal);

    await vi.advanceTimersByTimeAsync(500);

    const error1 = await expectErrAsync(result1);
    expect(error1.type === 'TIMEOUT');

    const controller2 = new AbortController();
    setTimeout(() => {
      controller2.abort();
    }, 200);

    const result2 = gh.getRepo(owner, name, controller1.signal);

    await vi.advanceTimersByTimeAsync(300);

    const error2 = await expectErrAsync(result2);
    expect(error2.type === 'ABORTED');
  });
});
