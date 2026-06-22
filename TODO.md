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

- [ ] (?) Interrupt DB queries
  - [ ] Pass AbortSignal into `repositoryRepo.findBatchForScanning`
