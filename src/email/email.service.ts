import { Result, ResultAsync } from 'neverthrow';

import type { AppError } from '@/utils/errors.js';

import type { ConfirmationEmailData, ReleaseEmailData } from './templates.js';
import { renderConfirmationEmail, renderReleaseEmail } from './templates.js';

export type Email =
  | { type: 'confirmation'; data: ConfirmationEmailData }
  | { type: 'release'; data: ReleaseEmailData };

export type EmailService = {
  sendEmail(to: string, email: Email): ResultAsync<void, AppError>;
};

function renderEmailUnsafe(email: Email) {
  switch (email.type) {
    case 'confirmation':
      return renderConfirmationEmail(email.data);
    case 'release':
      return renderReleaseEmail(email.data);
    default:
      email satisfies never;
      throw new Error('Unknown email type');
  }
}

const renderEmail = Result.fromThrowable(
  renderEmailUnsafe,
  () => ({ type: 'Internal', message: 'Failed to render email' }) as AppError,
);

async function mockSendEmail(to: string, email: Email) {
  console.log(`[Email:${email.type}] To: ${to}, Repo: ${email.data.repoName}`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  return;
}

function sendEmail(to: string, email: Email) {
  const renderedEmail = renderEmail(email);

  const ok = renderedEmail.asyncAndThen(() =>
    ResultAsync.fromPromise(mockSendEmail(to, email), (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { type: 'Internal', message: `Failed to send email: ${msg}` } as AppError;
    }),
  );

  return ok;
}

export function createEmailService(): EmailService {
  return {
    sendEmail,
  };
}
