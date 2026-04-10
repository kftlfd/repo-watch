import { Job, Worker } from 'bullmq';

import { EmailService } from '@/email/email.service.js';
import { redis } from '@/redis/redis.js';
import { RepositoryRepo } from '@/repository/repository.repo.js';

import {
  QUEUE_NAME_RELEASE_NOTIFICATIONS,
  ReleaseEmailJob,
} from './release-notifications.types.js';

type ProcessJobFn = (job: Job<ReleaseEmailJob>) => Promise<void>;

function createProcessReleaseNotificationJob(
  emailService: EmailService,
  repositoryRepo: RepositoryRepo,
): ProcessJobFn {
  return async function processJob(job) {
    const { repoId, email, tag: jobTag, repoName } = job.data;

    const latestTagResult = await repositoryRepo.getLatestTag(repoId);

    if (latestTagResult.isErr()) {
      const error = latestTagResult.error;
      console.error(`Failed to get latest tag for repo ${String(repoId)}:`, error.message);
      throw new Error(error.message);
    }

    const latestTag = latestTagResult.value;

    if (latestTag !== jobTag) {
      const jobId = job.id ?? 'unknown';
      console.log(`Skipping outdated job ${jobId}: job tag ${jobTag} != latest tag ${latestTag}`);
      return;
    }

    const sendResult = await emailService.sendEmail(email, {
      type: 'release',
      data: {
        repoName,
        tag: jobTag,
        releaseUrl: `https://github.com/${repoName}/releases/tag/${jobTag}`,
        unsubscribeUrl: `https://example.com/unsubscribe`,
      },
    });

    if (sendResult.isErr()) {
      const error = sendResult.error;
      console.error(`Failed to send email to ${email}:`, error.message);
      throw new Error(error.message);
    }

    console.log(`Sent release notification for ${repoName} ${jobTag} to ${email}`);
  };
}

export function createReleaseNotificationsWorker(
  emailService: EmailService,
  repositoryRepo: RepositoryRepo,
) {
  const processJob = createProcessReleaseNotificationJob(emailService, repositoryRepo);

  const emailWorker = new Worker<ReleaseEmailJob>(QUEUE_NAME_RELEASE_NOTIFICATIONS, processJob, {
    connection: redis,
    concurrency: 10,
    limiter: {
      max: 5,
      duration: 1000,
    },
  });

  emailWorker.on('failed', (job, error) => {
    const jobId = job?.id ?? 'unknown';
    console.error(`Job ${jobId} failed:`, error.message);
  });

  emailWorker.on('error', (error) => {
    console.error('Worker error:', error);
  });

  return emailWorker;
}
