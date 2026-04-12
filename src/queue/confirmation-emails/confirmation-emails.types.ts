export const QUEUE_NAME_CONFIRMATION_EMAILS = 'confirmation-emails';

export type ConfirmationEmailJob = {
  email: string;
  repoName: string;
  confirmHtmlUrl: string;
  confirmApiUrl: string;
};
