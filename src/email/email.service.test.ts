import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppError } from '@/utils/errors.js';
import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';

import type { Email } from './email.service.js';
import { createEmailService } from './email.service.js';

describe('email.service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends confirmation emails successfully', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = createEmailService();

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

    expect(logSpy).toHaveBeenCalledWith(
      '[Email:confirmation] To: user@example.com, Repo: owner/repo',
    );
  });

  it('sends release emails successfully', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = createEmailService();

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

    expect(logSpy).toHaveBeenCalledWith('[Email:release] To: user@example.com, Repo: owner/repo');
  });

  it('wraps mock sender failures as Internal errors', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {
      throw new Error('transport down');
    });
    const service = createEmailService();

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

    expect(error).toEqual({
      type: 'Internal',
      message: 'Failed to send email: transport down',
    } as AppError);
  });
});
