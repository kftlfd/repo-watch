# Subscription Component

## Overview

Core business logic for managing subscriptions to GitHub repository releases.

## Files

| File                         | Responsibility                                         |
| ---------------------------- | ------------------------------------------------------ |
| `subscription.api.ts`        | Fastify route handlers (HTTP endpoints)                |
| `subscription.controller.ts` | Input validation, orchestrating service calls          |
| `subscription.service.ts`    | Business logic (subscribe, confirm, unsubscribe, list) |
| `subscription.repo.ts`       | Database operations                                    |
| `subscription.web.ts`        | HTML page handlers                                     |
| `subscription.schema.ts`     | Zod validation schemas                                 |
| `templates.ts`               | HTML template strings                                  |

## API Routes

| Method | Path                        | Handler                    |
| ------ | --------------------------- | -------------------------- |
| POST   | `/api/subscribe`            | Subscribe to repo releases |
| GET    | `/api/confirm/:token`       | Confirm subscription       |
| GET    | `/api/unsubscribe/:token`   | Unsubscribe                |
| GET    | `/api/subscriptions?email=` | List subscriptions         |

## HTML Pages

| Method | Path                  | Handler                 |
| ------ | --------------------- | ----------------------- |
| GET    | `/`                   | Subscribe form          |
| POST   | `/subscribe`          | Subscribe (form submit) |
| GET    | `/confirm/:token`     | Confirm result          |
| GET    | `/unsubscribe/:token` | Unsubscribe result      |

## Subscribe Flow

1. **Validate input** - Zod schema (`email`, `repo` in `owner/repo` format)
2. **Verify repo exists** - Call GitHub API
3. **Sync repo to DB** - Create or update repository record
4. **Check existing subscription** - If active confirmed, return 409 Conflict
5. **Create subscription** - Insert or update subscription record
6. **Generate token** - Create confirmation token
7. **Enqueue confirmation email** - Add job to confirmation-emails queue

## Confirm Flow

1. **Validate token** - Check token exists, valid type ('confirm')
2. **Find subscription** - By email + repositoryId
3. **Mark confirmed** - Set `confirmedAt = now()` and `removedAt = null`
4. **Activate repo** - Set repository `isActive = true`
5. **Delete token** - Fire-and-forget

## Unsubscribe Flow

1. **Validate token** - Check token exists, valid type ('unsubscribe')
2. **Find subscription** - By email + repositoryId
3. **Soft delete** - Set `removedAt = now()`
4. **Delete token** - Fire-and-forget

## List Subscriptions Flow

1. **Validate email** - Query parameter required
2. **Query subscriptions** - Join with repositories table
3. **Return list** - Each item: `{ email, repo, confirmed, last_seen_tag }`

## Schema Validation

```typescript
const SubscribeInputSchema = z.object({
  email: z.email(),
  repo: z.string().regex(/^[^/]+\/[^/]+$/, 'Invalid format. Use owner/repo'),
});

const EmailSchema = z.email();
```

## Error Types

| Type          | HTTP Status | Description                    |
| ------------- | ----------- | ------------------------------ |
| `Validation`  | 400         | Invalid input                  |
| `NotFound`    | 404         | Repo or subscription not found |
| `Conflict`    | 409         | Already subscribed             |
| `RateLimited` | 429         | GitHub rate limited            |

## Database Schema

- **subscriptions** table: `id`, `email`, `repositoryId`, `confirmedAt`, `removedAt`, `createdAt`
  -Joined with **repositories** table for repo metadata

## Dependencies

- `GithubClient`: Verify repo exists
- `RepositoryRepo`: CRUD for repos
- `SubscriptionRepo`: CRUD for subscriptions
- `TokenService`: Generate/validate tokens
- `ConfirmationEmailsQueue`: Enqueue emails
