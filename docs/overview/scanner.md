# Scanner Component

## Overview

Infinite loop that periodically checks GitHub repositories for new releases. When a new release is detected, enqueues jobs to notify subscribers.

## Files

- **`src/scanner/scanner.loop.ts`**: Main scanner logic
- **`src/loop/loop.ts`**: Generic loop utility (reusable, not scanner-specific)

## Loop Behavior

The scanner uses the generic `createLoop()` utility from `src/loop/loop.ts`:

```typescript
createLoop({
  run(signal) {
    /* query repos and process each */
  },
  getNextDelayMs() {
    return config.scanIntervalMs;
  },
  onStart() {
    log.info('Scanner started');
  },
});
```

Configuration (from `config.scanner`):

- `scanIntervalMs`: Time between scan cycles (default: 60s)
- `batchSize`: Number of repos to process per cycle (default: 10)
- `pollDelayMs`: Delay between processing each repo in batch (default: 1s)
- `initialRetryDelay`: Initial delay for rate limit retries (default: 5000ms)

## Processing Flow

For each repo in the batch:

1. **Fetch latest release** with retry logic (`createFetchWithRetryFn`)
   - Retries on GitHub rate limit (429) with exponential backoff
   - Skips other errors and continues to next repo

2. **Compare with last seen tag**
   - If first check (`lastSeenTag === null`): only save tag, don't notify
   - If same tag: no new release, just update scan timestamp
   - If new tag: update tag, enqueue notification job

3. **Enqueue notification job**
   - Adds job to `repo-subscriptions` queue
   - Job data: `{ repoId, repoName, latestTag }`

## Rate Limit Handling

When GitHub API returns 429 (`TooManyRequests`):

- If `retry-after` header present: wait that many seconds
- Otherwise: exponential backoff starting at `initialRetryDelay`, doubling each retry

## Database Queries

- `repositoryRepo.findBatchForScanning(batchSize)`: Get least recently checked active repos
- `repositoryRepo.updateAfterScan(repoId, now, latestTag?)`: Update last checked time and (optionally) tag

## Dependencies

- `GithubClient`: Fetch latest release from GitHub API
- `RepositoryRepo`: Query and update repos in DB
- `RepoSubscriptionsQueue`: Enqueue notification jobs
- `Logger`: Structured logging
