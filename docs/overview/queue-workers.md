# Queue Workers Component

## Overview

Three BullMQ queues with workers for processing background jobs:

1. **Confirmation Emails** - sends subscription confirmation emails
2. **Release Notifications** - sends new release notification emails to subscribers
3. **Repo Subscriptions** - processes new repo releases, queries subscribers, enqueues notification jobs

## Architecture

```
Scanner detects new release
        ↓
[repo-subscriptions queue]  ←── Job: { repoId, repoName, latestTag }
        ↓
For each subscriber:
  [release-notifications queue]  ←── Job: { repoId, email, repoName, tag }
        ↓
[release-notifications worker] sends email
```

## Queue 1: Confirmation Emails

**Files**: `src/queue/confirmation-emails/`

- `confirmation-emails.queue.ts` - Queue setup
- `confirmation-emails.worker.ts` - Worker implementation
- `confirmation-emails.types.ts` - Job type definitions

**Job Data**:

```typescript
type ConfirmationEmailJob = {
  email: string;
  repoName: string;
  confirmHtmlUrl: string;
  confirmApiUrl: string;
};
```

**Processing**:

1. Fetch job data (email, repoName, confirm urls)
2. Send confirmation email via `EmailService`
3. Log success/failure

## Queue 2: Release Notifications

**Files**: `src/queue/release-notifications/`

- `release-notifications.queue.ts` - Queue setup
- `release-notifications.worker.ts` - Worker implementation
- `release-notifications.types.ts` - Job type definitions

**Job Data**:

```typescript
type ReleaseEmailJob = {
  repoId: number;
  email: string;
  repoName: string;
  tag: string;
};
```

**Processing**:

1. Verify job tag matches latest tag in DB (skip if outdated)
2. Generate unsubscribe token for this subscriber
3. Send release notification email with release URL
4. Log success/failure

**Stale Job Handling**: If the tag in the job doesn't match the current latest tag in DB, the job is skipped (no error thrown).

## Queue 3: Repo Subscriptions

**Files**: `src/queue/repo-subscriptions/`

- `repo-subscriptions.queue.ts` - Queue setup
- `repo-subscriptions.worker.ts` - Worker implementation
- `repo-subscriptions.types.ts` - Job type definitions
- `repo-subscriptions.types.ts` - Job config (batch sizes)

**Job Data**:

```typescript
type RepoSubscriptionsJob = {
  repoId: number;
  repoName: string;
  latestTag: string;
};
```

**Processing**:

1. Verify job tag matches latest tag in DB (skip if outdated)
2. Query subscribers for this repo in batches (cursor-based)
3. For each batch: enqueue release notification jobs
4. If no subscribers found: mark repo as inactive
5. Delay between batches (configurable)

**Batch Query**: Uses `subscriptionRepo.getConfirmedByRepositoryIdBatch(repoId, cursor, batchSize)` for pagination.

## Worker Configuration (shared)

From `config.queues.*`:

- `concurrency`: Number of concurrent jobs (default: 5)
- `limiter.max`: Max jobs per duration (default: 10)
- `limiter.duration`: Duration for limiter in ms (default: 1000ms)

## Dependencies

- `EmailService`: Send emails
- `RepositoryRepo`: Get latest tag, update repo status
- `SubscriptionRepo`: Query subscribers
- `TokenService`: Generate unsubscribe tokens
- `Logger`: Structured logging
