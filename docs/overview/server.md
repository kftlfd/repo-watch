# Server Component

## Overview

HTTP server using Fastify. Registers API routes under `/api` prefix and HTML pages at root.

## File: `src/server/server.ts`

Creates and configures the Fastify instance:

- Uses `@fastify/formbody` for form data parsing
- Registers subscription API routes with `/api` prefix
- Registers subscription web (HTML) pages at root
- Injects logger instance into Fastify

## API Routes

All routes defined in [`subscription.api.ts`](../../src/subscription/subscription.api.ts):

| Method | Path                        | Description                |
| ------ | --------------------------- | -------------------------- |
| POST   | `/api/subscribe`            | Subscribe to repo releases |
| GET    | `/api/confirm/:token`       | Confirm subscription       |
| GET    | `/api/unsubscribe/:token`   | Unsubscribe                |
| GET    | `/api/subscriptions?email=` | List subscriptions         |

## Error Handling

Uses `AppError` type from [`src/utils/errors.ts`](../../src/utils/errors.ts). Errors are converted to HTTP status codes via `mapErrorToHttp()`.

```typescript
type AppError =
  | { type: 'Validation'; message: string }
  | { type: 'NotFound'; message: string }
  | { type: 'Conflict'; message: string }
  | { type: 'RateLimited'; message: string; retryAfterSeconds: number | null };
```

HTTP status mapping:

- `Validation` → 400
- `NotFound` → 404
- `Conflict` → 409
- `RateLimited` → 429

## Dependencies

- `Logger` - for request logging
- `SubscriptionApi` - API route handlers
- `SubscriptionWeb` - HTML page handlers
