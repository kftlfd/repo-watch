# Repo Watch

GitHub releases notification service

**Stack:**

- TypeScript
- NodeJS
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

2. Run
   - in docker

   ```bash
   docker compose up
   ```

   - locally

   ```bash
   npm install

   # start DB and Redis
   npm run dev:infa:up

   npm run dev
   ```

3. Monitoring

```bash
cd monitoring
docker compose up -d
```

## Project overview

Monolith, on start runs DB migrations and starts 3 main services:

### 1. Web server

- API endpoints
  - `subscribe` to new repo releases notifications
    - if the repo exists, creates subscription and sends an email with confirmation token/link
  - `confirm` subscription
    - checks token validity, marks subscription as confirmed
  - `unsubscribe`
    - checks token validity, marks subscription as removed
  - `list subscriptions`
    - returns list of active subscriptions for given email

- Admin API endpoints
  - `health`, `metrics`

- API docs (auto-generated)

- HTTP pages
  - subscription form
  - confirm/unsubscribe results

### 2. Scanner

- continuously queries for the least recently checked active repos (that have active subscriptions)
- checks if there is a new release in the repo
- sends a job to the queue to notify subscribers

### 3. Queue workers

- Queue/worker for sending user-account emails

- Queue/worker for sending "new release notification" emails

- Queue/worker that processes a "notify subscribers for repo" job:
  - queries active subscribers for the repo
  - creates a new "send notification email" queue job for each subscriber
  - if no subscribers found, marks repo as inactive

### Additional notes

- caching Github API responses in Redis
- caching latest repo+tag in Redis to reduce DB queries
- actual email delivery is not implemented yet
