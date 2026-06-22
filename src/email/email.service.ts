import { Result, ResultAsync } from 'neverthrow';

import type { EmailsMetrics } from '@/metrics/metrics.js';
import { sleep } from '@/utils/sleep.js';

import type { ConfirmationEmailData, ReleaseEmailData } from './templates.js';
import { renderConfirmationEmail, renderReleaseEmail } from './templates.js';

export type Email =
  | { type: 'confirmation'; data: ConfirmationEmailData }
  | { type: 'release'; data: ReleaseEmailData };

export type EmailService = ReturnType<typeof createEmailService>;

function tryRenderEmail(email: Email) {
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
  tryRenderEmail,
  (err) => new Error('failed to render email', { cause: err }),
);

type Deps = {
  metrics: EmailsMetrics;
};

export function createEmailService({ metrics }: Deps) {
  function sendEmail(to: string, email: Email) {
    return renderEmail(email)
      .asyncAndThen(({ subject, html }) => {
        console.log(`[Email:${email.type}]`, { to, repo: email.data.repoName, subject, html });
        return ResultAsync.fromPromise(sleep(100), (err) => {
          return new Error('failed to send email', { cause: err });
        });
      })
      .andTee(() => {
        metrics.recordEmailStatus('ok');
      })
      .orTee(() => {
        metrics.recordEmailStatus('fail');
      });
  }

  return {
    sendEmail,
  };
}
