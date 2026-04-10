export const QUEUE_NAME_CONFIRMATION_EMAILS = 'confirmation-emails';

export type ConfirmationEmailJob = {
  email: string;
  repoName: string;
  confirmUrl: string;
};

export type EnqueueConfirmationEmailJobFn = (job: ConfirmationEmailJob) => Promise<void>;
