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
