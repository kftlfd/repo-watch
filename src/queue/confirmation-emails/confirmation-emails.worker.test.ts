import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Email } from '@/email/email.service.js';
import type { MockLogger } from '@/test/mocks.js';
import { createMockEmailService, createMockLogger } from '@/test/mocks.js';

import type { ConfirmationEmailJob } from './confirmation-emails.types.js';
import { createProcessConfirmationEmailJob } from './confirmation-emails.worker.js';

function createJob(overrides?: Partial<{ id: string; data: ConfirmationEmailJob }>) {
  return {
    id: 'job-1',
    data: {
      email: 'user@example.com',
      repoName: 'owner/repo',
      confirmHtmlUrl: 'http://localhost:3000/confirm/token',
      confirmApiUrl: 'http://localhost:3000/api/confirm/token',
    },
    ...overrides,
  };
}

describe('confirmation-emails.worker', () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends the confirmation email with the expected payload', async () => {
    const sendEmail = vi.fn().mockReturnValue(okAsync(undefined));

    const processJob = createProcessConfirmationEmailJob({
      log: logger,
      emailService: createMockEmailService({ sendEmail }),
    });

    await processJob(createJob() as never);

    expect(sendEmail).toHaveBeenCalledWith('user@example.com', {
      type: 'confirmation',
      data: {
        repoName: 'owner/repo',
        confirmHtmlUrl: 'http://localhost:3000/confirm/token',
        confirmApiUrl: 'http://localhost:3000/api/confirm/token',
      },
    } satisfies Email);
  });

  it('logs success on the happy path', async () => {
    const sendEmail = vi.fn().mockReturnValue(okAsync(undefined));

    const processJob = createProcessConfirmationEmailJob({
      log: logger,
      emailService: createMockEmailService({ sendEmail }),
    });

    await processJob(createJob() as never);

    expect(logger.info).toHaveBeenCalledWith(
      'Sent confirmation email for owner/repo to user@example.com',
    );
  });

  it('throws and logs when email sending fails', async () => {
    const sendError = { type: 'Internal', message: 'Failed to send email' } as const;
    const sendEmail = vi.fn().mockReturnValue(errAsync(sendError));

    const processJob = createProcessConfirmationEmailJob({
      log: logger,
      emailService: createMockEmailService({ sendEmail }),
    });

    await expect(processJob(createJob() as never)).rejects.toThrow('Failed to send email');
    expect(logger.error).toHaveBeenCalledWith(
      { error: sendError },
      'Failed to send confirmation email to user@example.com',
    );
  });
});
