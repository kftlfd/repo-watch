export const QUEUE_NAME_RELEASE_NOTIFICATIONS = 'release-notifications';

export type ReleaseEmailJob = {
  email: string;
  repoId: number;
  repoName: string;
  tag: string;
};
