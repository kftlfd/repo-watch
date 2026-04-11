import { Result, ResultAsync } from 'neverthrow';

import type { AppError } from '@/utils/errors.js';

import type { ConfirmationEmailData, ReleaseEmailData } from './templates.js';
import { renderConfirmationEmail, renderReleaseEmail } from './templates.js';

// TODO: Actual email delivery
// 1. Create Email Transport Abstraction (src/email/email.transport.ts)
//    - EmailTransport interface: { send(to, from, subject, html): Promise<void> }
//    - createSMTPTransport(config) using nodemailer
//    - createConsoleTransport() for development
//    - add EmailTransport dependency to EmailService
// 2. Add SMTP Configuration
//    - env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
//    - EmailConfig (fromAddress and optional smtp settings)
// 3. Wire in App.ts
//    - Choose transport based on environment/config
//    - Use SMTP if configured, otherwise console transport
// Error Handling:
//    - SMTP connection/auth failures → External error → queue retries
//    - Invalid recipients → External error → may need manual intervention
//    - Rate limiting → External error → queue retries with backoff

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
