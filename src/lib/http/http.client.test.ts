import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import z from 'zod';

import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';
import { sleep } from '@/utils/sleep.js';

import { createHttpClient } from './http.client.js';

describe('http.client abort signals', () => {
  const client = createHttpClient();

  const URL = 'http://localhost:8088';
  const body = 'ok';
  const bodySchema = z.string();

  const msw = setupServer(
    http.get(URL, async () => {
      await sleep(1_000);
      return HttpResponse.json(body);
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
    const result = client.httpGet(URL, bodySchema, { timeoutMs: 2_000 });

    await vi.advanceTimersByTimeAsync(1_100);

    const res = await expectOkAsync(result);
    expect(res === body);
  });

  it('returns timeout error result', async () => {
    const result = client.httpGet(URL, bodySchema, { timeoutMs: 200 });

    await vi.advanceTimersByTimeAsync(400);

    const error = await expectErrAsync(result);
    expect(error.type === 'TIMEOUT');
  });

  it('returns abort error result', async () => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 300);

    const result = client.httpGet(URL, bodySchema, { abortSignal: controller.signal });

    await vi.advanceTimersByTimeAsync(400);

    const error = await expectErrAsync(result);
    expect(error.type === 'ABORTED');
  });

  it('returns first timeout/abort error result', async () => {
    const controller1 = new AbortController();
    setTimeout(() => {
      controller1.abort();
    }, 400);

    const result1 = client.httpGet(URL, bodySchema, {
      abortSignal: controller1.signal,
      timeoutMs: 200,
    });

    await vi.advanceTimersByTimeAsync(800);

    const error1 = await expectErrAsync(result1);
    expect(error1.type === 'TIMEOUT');

    const controller2 = new AbortController();
    setTimeout(() => {
      controller2.abort();
    }, 200);

    const result2 = client.httpGet(URL, bodySchema, {
      abortSignal: controller2.signal,
      timeoutMs: 400,
    });

    await vi.advanceTimersByTimeAsync(800);

    const error2 = await expectErrAsync(result2);
    expect(error2.type === 'ABORTED');
  });
});
