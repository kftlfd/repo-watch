# Project Structure

```
repo-watch/
├── docs/                          # Documentation
│   └── structure.md               # This file
├── src/
│   ├── main.ts                    # Application entry point
│   ├── app.ts                    # Dependency injection setup
│   │
│   ├── config/                   # Configuration
│   │   ├── config.ts             # Config definitions
│   │   └── env.ts                # Environment variables
│   │
│   ├── server/                   # HTTP server
│   │   └── server.ts             # Fastify server setup
│   │
│   ├── subscription/             # Subscription API
│   │   ├── subscription.api.ts   # Route handlers
│   │   ├── subscription.controller.ts
│   │   ├── subscription.service.ts
│   │   ├── subscription.repo.ts  # Database operations
│   │   ├── subscription.web.ts   # HTML pages
│   │   ├── subscription.schema.ts # Zod schemas
│   │   └── templates.ts          # HTML templates
│   │
│   ├── scanner/                  # Release scanner
│   │   └── scanner.loop.ts       # Infinite loop
│   │
│   ├── queue/                    # Queue workers
│   │   ├── confirmation-emails/
│   │   │   ├── confirmation-emails.queue.ts
│   │   │   ├── confirmation-emails.worker.ts
│   │   │   └── confirmation-emails.types.ts
│   │   ├── release-notifications/
│   │   │   ├── release-notifications.queue.ts
│   │   │   ├── release-notifications.worker.ts
│   │   │   └── release-notifications.types.ts
│   │   └── repo-subscriptions/
│   │       ├── repo-subscriptions.queue.ts
│   │       ├── repo-subscriptions.worker.ts
│   │       └── repo-subscriptions.types.ts
│   │
│   ├── github/                   # GitHub API client
│   │   ├── github.client.ts       # HTTP client
│   │   ├── github.cached.ts     # Redis cache wrapper
│   │   ├── github.schema.ts    # Response types
│   │   └── utils.ts             # Helpers
│   │
│   ├── token/                    # Token service
│   │   ├── token.service.ts    # Token generation/validation
│   │   └── token.repo.ts        # Token storage
│   │
│   ├── repository/               # Repository repo
│   │   └── repository.repo.ts   # DB operations for repos
│   │
│   ├── db/                       # Database
│   │   ├── client.ts             # Drizzle client + migrations
│   │   ├── schema.ts           # Table definitions
│   │   └── migrations/          # SQL migrations
│   │       └── meta/
│   │
│   ├── email/                    # Email service
│   │   ├── email.service.ts    # Email sender
│   │   └── templates.ts        # Email templates
│   │
│   ├── redis/                    # Redis client
│   │   └── redis.ts             # Redis connection
│   │
│   ├── cache/                    # Caching layer
│   │   ├── cache.ts            # Cache interface
│   │   └── redisCache.ts       # Redis implementation
│   │
│   ├── logger/                   # Logger
│   │   └── logger.ts            # Console logger
│   │
│   ├── utils/                    # Utilities
│   │   ├── errors.ts            # Error types
│   │   ├── html.ts             # HTML helpers
│   │   └── sleep.ts            # Sleep helper
│   │
│   └── test/                     # Test utilities
│       ├── integration/
│       │   ├── setup.ts
│       │   ├── global-setup.ts
│       │   ├── seeds.ts
│       │   └── ...
│       ├── mocks.ts
│       ├── factories.ts
│       └── utils/
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.unit.config.ts
├── vitest.int.config.ts
├── eslint.config.js
├── prettier.config.js
│
├── Dockerfile
├── docker-compose.yml
├── docker-compose.test.yml
│
├── drizzle.config.ts
├── .env
├── .env.example
├── .env.test
├── .env.test.example
│
├── README.md
├── TODO.md
└── swagger.yaml
```

## Module Responsibilities

### Main Entry

- **main.ts**: Bootstrap, signal handling, graceful shutdown
- **app.ts**: Create all dependencies via DI

### Config

- **config**: All configurable values (ports, batch sizes, timeouts)
- **env**: Environment variable loading

### Server

- **server.ts**: Fastify instance, route registration, JSON schemas

### Subscription API

- **subscription.api.ts**: HTTP route handlers (Fastify)
- **subscription.controller.ts**: Input validation, orchestration
- **subscription.service.ts**: Business logic
- **subscription.repo.ts**: DB operations
- **subscription.web.ts**: HTML pages for confirm/unsubscribe
- **subscription.schema.ts**: Zod validation schemas

### Scanner

- **scanner.loop.ts**: Infinite loop querying repos, checking releases

### Queue Workers

- **confirmation-emails**: Send confirmation emails
- **release-notifications**: Send release notification emails
- **repo-subscriptions**: Process new releases, enqueue notifications

### GitHub Client

- **github.client.ts**: HTTP calls to GitHub API
- **github.cached.ts**: Redis caching with 10min TTL
- **github.schema.ts**: TypeScript types for API responses

### Token Service

- **token.service.ts**: Generate/validate tokens
- **token.repo.ts**: Token storage in Redis

### Repository Repo

- **repository.repo.ts**: CRUD for tracked repositories

### Database

- **client.ts**: Drizzle client, migration runner
- **schema.ts**: Table definitions (subscriptions, repos, tokens)
- **migrations/**: SQL migration files

### Email

- **email.service.ts**: Email sending (console for dev)
- **templates.ts**: HTML email templates

### Redis

- **redis.ts**: Redis connection
- **cache.ts**: Cache interface
- **redisCache.ts**: Redis cache implementation

### Logger

- **logger.ts**: Structured logging to console

### Utils

- **errors.ts**: Error type definitions
- **html.ts**: HTML escaping utilities
- **sleep.ts**: Async sleep function

### Tests

- **test/integration**: Integration test setup
- **mocks.ts**: Mock implementations
- **factories.ts**: Test data factories

## Data Flow

### Subscribe Flow

```
POST /api/subscribe
  → subscriptionApi → subscriptionController → subscriptionService
    → verify repo exists (GitHub API)
    → save repo to DB
    → check existing subscription
    → create subscription (unconfirmed)
    → generate token
    → queue confirmation email
```

### Confirm Flow

```
GET /api/confirm/:token
  → subscriptionApi → subscriptionController → subscriptionService
    → validate token
    → mark subscription confirmed
    → mark repo active
```

### Scanner Flow

```
scannerLoop.start()
  → query least recently checked repos (batch)
  → for each repo:
    → check latest release (GitHub API)
    → if new release:
      → update repo in DB
      → cache repo+tag
      → queue "notify subscribers" job
```

### Notify Flow

```
repo-subscriptions worker
  → get job data (repo, tag)
  → verify tag is latest
  → query subscribers in batches
  → for each: queue "send notification"

release-notifications worker
  → get job data (subscriber, repo, tag)
  → verify tag is latest
  → send email
```
