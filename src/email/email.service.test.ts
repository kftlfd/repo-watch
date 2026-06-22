import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EmailsMetrics } from '@/metrics/metrics.js';
import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';

import type { Email } from './email.service.js';
import { createEmailService } from './email.service.js';

function createMockMetrics() {
  return {
    recordEmailStatus: vi.fn(),
  } satisfies EmailsMetrics;
}

describe('email.service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends confirmation emails successfully', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = createEmailService({ metrics: createMockMetrics() });

    await expectOkAsync(
      service.sendEmail('user@example.com', {
        type: 'confirmation',
        data: {
          repoName: 'owner/repo',
          confirmHtmlUrl: 'http://localhost:3000/confirm/token',
          confirmApiUrl: 'http://localhost:3000/api/confirm/token',
        },
      } as Email),
    );
  });

  it('sends release emails successfully', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = createEmailService({ metrics: createMockMetrics() });

    await expectOkAsync(
      service.sendEmail('user@example.com', {
        type: 'release',
        data: {
          repoName: 'owner/repo',
          tag: 'v2.0.0',
          releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
          unsubscribeHtmlUrl: 'http://localhost:3000/unsubscribe/token',
          unsubscribeApiUrl: 'http://localhost:3000/api/unsubscribe/token',
        },
      } as Email),
    );
  });

  it('wraps mock sender failures as errors', async () => {
    const err = new Error('transport down');
    vi.spyOn(console, 'log').mockImplementation(() => {
      throw err;
    });
    const service = createEmailService({ metrics: createMockMetrics() });

    const error = await expectErrAsync(
      service.sendEmail('user@example.com', {
        type: 'confirmation',
        data: {
          repoName: 'owner/repo',
          confirmHtmlUrl: 'http://localhost:3000/confirm/token',
          confirmApiUrl: 'http://localhost:3000/api/confirm/token',
        },
      } as Email),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error && error.cause === err);
  });
});
