# TODO

- [ ] add abort signal support for github client
- [ ] mitigate infinite scanner loop iteration on persistent rate limits (maxTries? maxDelay? return error)
- [ ] refactor subscription.service `subscribe`
- [ ] AppError -> something better

- [ ] wrap multi-step DB queries in transactions
- [ ] db clean-up worker/loop to delete expired tokens

- [ ] healthcheck endpoint
- [ ] metrics endpoint
- [ ] swagger docs
- [ ] (?) fastify schemas for routes
- [ ] (?) Bruno collection
- [ ] documentation
- [ ] add rate limits
- [ ] (?) auth token protection for API routes

- [ ] e2e tests

- [ ] emails
- [ ] gRPC
- [ ] split into microservices

# Scanner

- [ ] (!) Handle `enqueueRepoSubscriptions` fails
  - [ ] create new "outbox" DB table + worker
  - [ ] whene new release detected: save repo update and create new row in outbox in one transaction

- [ ] Add scanner health metrics for monitoring
  - [ ] lastSuccessfulScan timestamp
  - [ ] totalReposScanned counter
  - [ ] apiCallsPerScan average
  - [ ] reposWithNewReleases counter
  - [ ] retries in `fetchWithRetries`

- [ ] (?) Interrupt DB queries
  - [ ] Pass AbortSignal into `repositoryRepo.findBatchForScanning`

# Email

- [ ] Create Email Transport Abstraction (src/email/email.transport.ts)
  - [ ] EmailTransport interface: { send(to, from, subject, html): Promise<void> }
  - [ ] createSMTPTransport(config) using nodemailer
  - [ ] createConsoleTransport() for development
  - [ ] add EmailTransport dependency to EmailService

- [ ] Add SMTP Configuration
  - [ ] env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
  - [ ] EmailConfig (fromAddress and optional smtp settings)

- [ ] Wire in App.ts
  - [ ] Choose transport based on environment/config
  - [ ] Use SMTP if configured, otherwise console transport

- [ ] Error Handling:
  - [ ] SMTP connection/auth failures → External error → queue retries
  - [ ] Invalid recipients → External error → may need manual intervention
  - [ ] Rate limiting → External error → queue retries with backoff

# Prometheus `/metrics`

- [ ] configure `prom-client`
  - [ ] `src/metrics/metrics.ts`
    - initialize registry
    - define metrics (Counter and Histogram)
    - export register to endpoint
  - [ ] `src/server/server.ts`
    - add `/metrics` endpoint
    - protected with API key auth
    - Prometheus text format: Return `register.metrics()` with proper content-type

- [ ] gather metrics
  - [ ] server
    - request count and duration (with Fastify hooks `onRequest`, `onResponse`)
    - `http_requests_total` - Counter with labels: method, route, status_code
    - `http_request_duration_seconds` - Histogram with labels: method, route
  - [ ] scanner
    - increment counters at appropriate lifecycle points: total iterations, processed repos, failues, new releases
    - `scanner_scan_cycles_total` - Counter for number of scan cycles
    - `scanner_repos_processed_total` - Counter for repositories processed
    - `scanner_github_failures_total` - Counter for GitHub API failures
    - `scanner_new_releases_total` - Counter for new releases detected
  - [ ] workers
    - total processed, failed, skipped
    - (?) number of jobs pending in queue
    - `worker_jobs_processed_total` - Counter with label: queue
    - `worker_jobs_failed_total` - Counter with label: queue
    - `worker_jobs_skipped_total` - Counter with label: queue (outdated jobs)
  - [ ] email
    - attempts, failures
    - `email_sends_total` - Counter with label: type (confirmation, release)
    - `email_failures_total` - Counter with label: type

- [ ] extra metrics
  - [ ] subscriptions
    - `subscriptions_active_total`
    - `subscriptions_by_repo` (gauge with repo label)
  - [ ] tokens
    - `tokens_created_total`
    - `tokens_validated_total`
    - `tokens_expired_total`
  - [ ] cache
    - `cache_hits_total`
    - `cache_misses_total`
    - `cache_hit_ratio` (gauge)
  - [ ] repos
    - `repositories_total`
    - `repositories_active`
    - `repositories_by_last_scan_age` (histogram)
  - [ ] queue depth metrics: number of jobs waiting in each queue
    - `queue_depth{queue="confirmation-emails"}`
    - `queue_depth{queue="release-notifications"}`
    - `queue_depth{queue="repo-subscriptions"}`

- [ ] (?) runtime metrics (via prom-client `collectDefaultMetrics({ register })`)
  - [ ] memory, cpu usage
  - [ ] event loop lag
  - [ ] active requests
  - [ ] GC statistics
