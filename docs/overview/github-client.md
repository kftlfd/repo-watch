# GitHub Client

## Overview

HTTP client for GitHub API. Fetches repository info and latest releases. Handles rate limits with exponential backoff.

## Files

| File               | Responsibility                   |
| ------------------ | -------------------------------- |
| `github.client.ts` | HTTP client using native `fetch` |
| `github.cached.ts` | Redis cache wrapper (10min TTL)  |
| `github.schema.ts` | Zod schemas for API responses    |
| `utils.ts`         | Error mapping utilities          |

## API Endpoints

| Method                          | Endpoint                                             | Description             |
| ------------------------------- | ---------------------------------------------------- | ----------------------- |
| `getRepo(owner, repo)`          | `GET /repos/:owner/:repo`                            | Get repository metadata |
| `getLatestRelease(owner, repo)` | `GET /repos/:owner/:repo/releases/latest` or `/tags` | Get latest release tag  |

## Caching

The cached client wraps the base client:

1. Check Redis cache (`gh-http:{method}:{owner/name}`)
2. On miss: call GitHub API, store in cache with 10min TTL
3. On hit: parse cached JSON

## Rate Limit Handling

When GitHub returns 429 (`TooManyRequests`):

- Checks `retry-after` header for wait time
- Scanner handles retry with exponential backoff

## Error Types

Error mapping in `utils.ts` converts HTTP errors to `HttpError`:

```typescript
type HttpError =
  | { type: 'NotFound'; message: string }
  | { type: 'TooManyRequests'; message: string; retryAfterSeconds: number | null }
  | { type: 'Unauthorized'; message: string }
  | { type: 'BadResponse'; message: string }
  | { type: 'NetworkError'; message: string }
  | { type: 'Unknown'; message: string };
```

## Configuration

- `baseUrl`: GitHub API URL (default: `https://api.github.com`)
- `authToken`: Optional GitHub API token for higher rate limits
- `timeoutMs`: Request timeout (default: 10000)
- `cacheTtlSeconds`: Cache TTL (default: 600 = 10min)

## Dependencies

- `Cache`: Redis cache
- `Logger`: Structured logging
