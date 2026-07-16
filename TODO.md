# TODO

- [ ] (!) Scanner: Handle `enqueueRepoSubscriptions` fails
  - create new "outbox" DB table + worker
  - when a new release is detected: save repo update and create new row in outbox in one transaction

- [ ] wrap multi-step DB queries in transactions

- [ ] db clean-up worker/loop to delete expired tokens

- [ ] Bruno collection
- [ ] documentation
- [ ] e2e tests
- [ ] emails
- [ ] gRPC
- [ ] split into microservices

# Done

- [x] swagger docs
  - Web:
    - html content-type
    - response description
  - Api
    - response description
- [x] auth token protection for admin routes
- [x] add abort signal support for github client
- [x] AppError -> something better
- [x] refactor subscription.service `subscribe`
- [x] mitigate infinite scanner loop iteration on persistent rate limits (maxTries? maxDelay? return error) -> track rate limit errors with metrics, set up alerts
- [x] healthcheck endpoint
- [x] metrics endpoint
