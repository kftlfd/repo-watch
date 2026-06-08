# Token Service

## Overview

Handles token generation, validation, and URL construction for subscription confirmations and unsubscribes.

## Files

| File               | Responsibility                                                 |
| ------------------ | -------------------------------------------------------------- |
| `token.service.ts` | Token generation (crypto random), validation, URL construction |
| `token.repo.ts`    | Token storage (PostgreSQL)                                     |

## Token Types

- `confirm` - For confirming subscriptions
- `unsubscribe` - For unsubscribing

## Token Generation

```typescript
function generateToken(): string {
  return randomBytes(32).toString('hex'); // 256-bit random
}
```

Tokens are HMAC-hashed before storage (server secret from config).

## Validation

1. Hash token with HMAC-SHA256
2. Query DB for token hash + type + valid expiry
3. Return token record or NotFound error

## URL Construction

```typescript
getTokenUrls(token: string, type: TokenType): TokenUrls
// type = 'confirm' → /api/confirm/:token (API) and /confirm/:token (HTML)
// type = 'unsubscribe' → /api/unsubscribe/:token and /unsubscribe/:token
```

## Configuration

- `tokenExpiryHours`: Hours until token expires (default: 168 = 7 days)
- `serverSecret`: HMAC key for hashing tokens

## Dependencies

- `TokenRepo`: CRUD operations
