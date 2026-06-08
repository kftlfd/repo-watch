# Email Service

## Overview

Sends email notifications (confirmation and release notifications).

## File

`src/email/email.service.ts`

## Email Types

- `Confirmation` - Sent when subscribing, contains confirm link
- `Release` - Sent when new release detected, contains release URL and unsubscribe link

## Implementation

Currently uses mock sender (logs to console in dev):

```typescript
async function mockSendEmail(to: string, email: Email) {
  console.log(`[Email:${email.type}] To: ${to}, Repo: ${email.data.repoName}`);
  await new Promise((resolve) => setTimeout(resolve, 500));
}
```

Template rendering is validated and wrapped in Result type for error handling.

## Dependencies

- Templates (`src/email/templates.ts`) for HTML rendering
