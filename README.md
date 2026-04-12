# Repo Watch

GitHub release notification service

**Stack:**

- NodeJS
- TypeScript
- Fastify
- PostgreSQL + Drizzle
- Redis + BullMQ
- Zod
- neverthrow

## Setup

1. Add `.env`

```bash
cp .env.example .env

```

2. Run in docker

```bash
docker compose up
```

3. Run locally

```bash
npm install

# start DB and Redis
docker compose up -d postgres redis

npm run start
```

## Project overview

Monolith service with 3 main parts:

### 1. Web server

- API endpoints
  - `subscribe` to new repo releases notifications
    - checks if the repo exists (via Github API), saves/updates repo in the DB
    - checks if not already subscribed
    - creates subscription, marks repo as active in DB
    - doesn't save the current repo release tag yet - `Scanner` does that eventually
    - generates confirmation token
    - enqueues confirmation email to be sent
  - `confirm` subscription
    - checks token validity
    - marks subscription as confirmed and reaffirms repo as active
    - (tries to delete the token, ignores error)
  - `unsubscribe`
    - checks token validity
    - mark subscription as removed (if exists)
    - (tries to delete the token, ignore error)
  - `list subscriptions`
    - query DB for subscriptions for given email
    - return list of subscriptions (empty list even if email is not found)

- HTTP pages (uses simple html-strings)
  - subscribe form
  - confirm/unsubscribe results

### 2. Scanner

- infinite loop
- queries `batch_size` of least recently checked active repos, for each repo:
  - checks if there is a new release (wait/backoff on GH API rate limits, skips and goes to the next repo on other errors)
  - if the new release is detected:
    - update the repo in DB and save repo+tag to cache
    - enqueue a job to notify subscribers for that repo
    - doesn't enqueue a job if it's a first check of the repo

### 3. Queue workers

- Queue/worker that sends "confirm subscription" emails

- Queue/worker that processes a "notify subscribers for repo" job:
  - checks if the tag in job is the latest tag (skip the job if not)
  - queries active subscribers for the repo (in batches, using cursor)
  - for each: enqueues a "send notification email" job
  - if no subscribers found: marks repo as inactive (to exclude from scanning)

- Queue/worker that sends notification emails
  - checks if the tag in job is the latest tag (skip the job if not)
  - sends email to subscriber

### Additional notes

- runs DB migrations on the service start
- uses Redis to cache Github API responses
- uses Redis to cache the latest repo+tag for reducing the DB queries
- unit and integration tests

### Intentional Decisions

- actual email delivery is intentionally not implemented yet (low priority).

- API returns extra `5xx` errors (DB errors, rate limits, etc.) which are not specified in the Swagger contract.

### TODO

- add real email transport
- wrap multi-step DB queries in transactions
- db clean-up worker/loop to delete expired tokens
