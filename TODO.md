# TODO

- [ ] wrap multi-step DB queries in transactions
- [ ] db clean-up worker/loop to delete expired tokens

- [ ] healthcheck endpoint
- [ ] swagger docs
- [ ] (?) fastify schemas for routes
- [ ] (?) Bruno collection
- [ ] documentation
- [ ] add rate limits

- [ ] e2e tests

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

- [ ] `prom-client`
  - [ ] initialize registry
  - [ ] define metrics
  - [ ] export register to endpoint

- [ ] `/metrics` endpoint
  - [ ] protected with API key auth
  - [ ] Prometheus text format

- [ ] gather metrics
  - [ ] server
    - [ ] request count and duration (with Fastify `onRequest`, `onResponse`)
  - [ ] scanner
    - [ ] total iterations, processed repos, failues, new releases
  - [ ] workers
    - [ ] total processed, failed, skipped
    - [ ] (?) number of jobs pending in queue
  - [ ] email
    - [ ] attempts, failures

- [ ] extra metrics
  - [ ] subscriptions
    - [ ] total active, by repo
  - [ ] tokens
    - [ ] total created, validated, expired
  - [ ] cache
    - hits, misses, ratio
  - [ ] repos
    - [ ] total, active, histogram by last scan age

- [ ] (?) runtime metrics (`collectDefaultMetrics({ register })`)
  - [ ] memory, cpu usage
  - [ ] event loop lag
  - [ ] active requests
  - [ ] GC statistics
