import { errAsync, ResultAsync } from 'neverthrow';

import type { HttpError } from '@/utils/errors.js';

function parseRetryAfterSeconds(header: string | null | undefined): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds);
  }

  const timestamp = new Date(header).getTime();
  if (Number.isFinite(timestamp)) {
    return Math.max(0, Math.ceil((timestamp - Date.now()) / 1_000));
  }

  return null;
}

function parseRateLimitResetSeconds(header: string | null | undefined): number | null {
  if (!header) return null;

  const resetAtSeconds = Number(header);
  if (Number.isFinite(resetAtSeconds)) {
    return Math.max(0, Math.ceil((resetAtSeconds * 1000 - Date.now()) / 1_000));
  }

  return null;
}

function getRetryAfterSeconds(response: Response): number | null {
  return (
    parseRetryAfterSeconds(response.headers.get('retry-after')) ??
    parseRateLimitResetSeconds(response.headers.get('x-ratelimit-reset'))
  );
}

function isGithubRateLimitResponse(response: Response, bodyText: string): boolean {
  const remaining = response.headers.get('x-ratelimit-remaining');
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  if (remaining === '0') return true;
  return bodyText.toLowerCase().includes('rate limit');
}

type ParseLimitResult =
  | { isRateLimitError: false }
  | { isRateLimitError: true; retryAfterSeconds: number | null };

function parseRateLimitResponse(response: Response, bodyText: string): ParseLimitResult {
  if (!isGithubRateLimitResponse(response, bodyText)) {
    return { isRateLimitError: false };
  }
  return { isRateLimitError: true, retryAfterSeconds: getRetryAfterSeconds(response) };
}

export function mapResponseToError(response: Response): ResultAsync<never, HttpError> {
  if (response.status === 404) {
    return errAsync<never, HttpError>({ type: 'NotFound', message: 'Repo not found' });
  }

  const bodyTextResult = ResultAsync.fromSafePromise(response.text().catch(() => ''));

  return bodyTextResult.andThen((body) => {
    const res = parseRateLimitResponse(response, body);

    if (res.isRateLimitError) {
      return errAsync<never, HttpError>({
        type: 'TooManyRequests',
        retryAfterSeconds: res.retryAfterSeconds,
      });
    }

    if (response.status === 401 || response.status === 403) {
      return errAsync<never, HttpError>({ type: 'Unauthorized', message: 'Authentication failed' });
    }

    return errAsync<never, HttpError>({
      type: 'Unknown',
      statusCode: response.status,
      message: response.statusText,
    });
  });
}
