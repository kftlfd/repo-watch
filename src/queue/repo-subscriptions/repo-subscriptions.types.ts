export const QUEUE_NAME_REPO_SUBSCRIPTIONS = 'repo-subscriptions';

export type RepoSubscriptionsJob = {
  repoId: number;
  repoName: string;
  latestTag: string;
};
