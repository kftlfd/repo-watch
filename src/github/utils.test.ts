import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expectErrAsync } from '@/test/utils/result.js';

import { mapResponseToError } from './utils.js';

function createResponse(body: string, init: ResponseInit): Response {
  return new Response(body, init);
}

describe('github utils', () => {
  const fixedNow = new Date('2026-04-12T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps 404 responses to NotFound', async () => {
    const error = await expectErrAsync(
      mapResponseToError(createResponse('', { status: 404, statusText: 'Not Found' })),
    );

    expect(error.type === 'HttpNotFound');
  });

  it('maps 429 responses to TooManyRequests using numeric Retry-After', async () => {
    const error = await expectErrAsync(
      mapResponseToError(
        createResponse('rate limit', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '42' },
        }),
      ),
    );

    expect(error.type === 'HttpTooManyRequests' && error.retryAfterSeconds === 42);
  });

  it('parses Retry-After HTTP date values for rate-limited responses', async () => {
    const retryAt = 'Sun, 12 Apr 2026 12:00:30 GMT';

    const error = await expectErrAsync(
      mapResponseToError(
        createResponse('secondary rate limit', {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'retry-after': retryAt },
        }),
      ),
    );

    expect(error.type === 'HttpTooManyRequests' && error.retryAfterSeconds === 30);
  });

  it('uses x-ratelimit-reset as a fallback for rate-limited responses', async () => {
    const resetAtSeconds = Math.floor(fixedNow.getTime() / 1000) + 90;

    const error = await expectErrAsync(
      mapResponseToError(
        createResponse('API rate limit exceeded', {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'x-ratelimit-reset': resetAtSeconds.toString() },
        }),
      ),
    );

    expect(error.type === 'HttpTooManyRequests' && error.retryAfterSeconds === 90);
  });

  it('treats 403 with x-ratelimit-remaining zero as TooManyRequests', async () => {
    const error = await expectErrAsync(
      mapResponseToError(
        createResponse('forbidden', {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'x-ratelimit-remaining': '0' },
        }),
      ),
    );

    expect(error.type === 'HttpTooManyRequests' && error.retryAfterSeconds === null);
  });

  it('maps non-rate-limit 401 and 403 responses to Unauthorized', async () => {
    const unauthorized401 = await expectErrAsync(
      mapResponseToError(
        createResponse('auth failed', { status: 401, statusText: 'Unauthorized' }),
      ),
    );
    const unauthorized403 = await expectErrAsync(
      mapResponseToError(createResponse('forbidden', { status: 403, statusText: 'Forbidden' })),
    );

    expect(unauthorized401.type === 'HttpUnauthorized');
    expect(unauthorized403.type === 'HttpUnauthorized');
  });
});
