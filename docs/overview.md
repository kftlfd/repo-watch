# Project Overview

## Core Components

The project has the following main components, listed in dependency order (reverse from bootstrap):

### App & Main

- **`src/main.ts`**: Entry point. Bootstraps the application, runs DB migrations, starts scanner loop, HTTP server, and queue workers. Handles graceful shutdown via SIGINT/SIGTERM.

- **`src/app.ts`**: Dependency injection setup. Creates and wires all services, repos, queues, workers, and the HTTP server.

### Server

- **`src/server/server.ts`**: Fastify HTTP server. Registers API routes (`/api/subscribe`, `/api/confirm/:token`, etc.) and HTML pages. Uses request/response validation schemas. Returns JSON errors via `AppError` type.

See [`docs/overview/server.md`](docs/overview/server.md) for details.

### Scanner

- **`src/scanner/scanner.loop.ts`**: Infinite loop that periodically checks repositories for new releases. Queries a batch of least-recently-checked repos, calls GitHub API to get latest release, enqueues notification jobs when new release detected.

See [`docs/overview/scanner.md`](docs/overview/scanner.md) for details.

### Queue Workers

Three queues with BullMQ:

- **`src/queue/confirmation-emails/`**: Worker that processes confirmation email jobs. Sends confirmation emails to subscribers.

- **`src/queue/release-notifications/`**: Worker that processes release notification jobs. Sends notification emails to subscribers when a new release is detected.

- **`src/queue/repo-subscriptions/`**: Worker that processes repo update jobs. When a new release is found, queries active subscribers and enqueues notification jobs.

See [`docs/overview/queue-workers.md`](docs/overview/queue-workers.md) for details.

### Subscription

Main business logic:

- **`src/subscription/subscription.api.ts`**: Fastify route handlers. Defines `POST /subscribe`, `GET /confirm/:token`, `GET /unsubscribe/:token`, `GET /subscriptions`.

- **`src/subscription/subscription.controller.ts`**: Input validation with Zod schemas (`SubscribeInputSchema`). Orchestrates service calls.

- **`src/subscription/subscription.service.ts`**: Core business logic. Validates repo via GitHub API, creates/updates subscriptions, generates tokens, enqueues confirmation emails.

- **`src/subscription/subscription.repo.ts`**: Database operations for subscriptions (CRUD).

- **`src/subscription/subscription.web.ts`**: HTML pages for confirmation/unsubscribe results.

- **`src/subscription/subscription.schema.ts`**: Zod validation schemas for input/output.

See [`docs/overview/subscription.md`](docs/overview/subscription.md) for details.

### Token Service

- **`src/token/token.service.ts`**: Token generation (crypto random) and validation.

- **`src/token/token.repo.ts`**: Token storage in PostgreSQL with expiry.

See [`docs/overview/token-service.md`](docs/overview/token-service.md) for details.

### Repository Repo

- **`src/repository/repository.repo.ts`**: Database CRUD for tracked repositories. Stores `owner/repo`, GitHub metadata, last seen tag.

See [`docs/overview/repository-repo.md`](docs/overview/repository-repo.md) for details.

### Email Service

- **`src/email/email.service.ts`**: Email sending (logs to console in dev). Uses HTML templates.

See [`docs/overview/email-service.md`](docs/overview/email-service.md) for details.

### GitHub Client

- **`src/github/github.client.ts`**: HTTP client for GitHub API. Fetches repository info, latest release. Handles rate limits (429 responses with backoff).

- **`src/github/github.cached.ts`**: Redis cache wrapper with 10-minute TTL.

- **`src/github/github.schema.ts`**: TypeScript types for GitHub API responses.

- **`src/github/utils.ts`**: Helper functions (owner/repo parsing).

- **`src/github/utils.test.ts`**: Unit tests.

See [`docs/overview/github-client.md`](docs/overview/github-client.md) for details.

### Infrastructure (grouped in overview.md)

- **Configuration**: `src/config/` - `config.ts` definitions, `env.ts` environment variable loading.

- **Database**: `src/db/` - `client.ts` Drizzle client + migration runner, `schema.ts` table definitions.

- **Redis & Cache**: `src/redis/` - Redis connection, `src/cache/` - Redis cache implementation (10min TTL).

- **Logger**: `src/logger/logger.ts` - Structured console logging.

- **Utils**: Errors use `AppError` type across components. `HttpError` for GitHub API errors.
