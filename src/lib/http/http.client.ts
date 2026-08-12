import { err, ok, ResultAsync } from 'neverthrow';
import { z, ZodType } from 'zod';

import type { HttpBadResponseError, HttpNetworkError } from '@/utils/html.js';
import { httpErrors } from '@/utils/html.js';

import type { HttpRequestError } from './utils.js';
import { mapResponseToError } from './utils.js';

export type HttpClient = ReturnType<typeof createHttpClient>;

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json',
};

type GetOpts = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
};

export function createHttpClient() {
  function httpGet<TSchema extends ZodType>(
    url: string,
    bodySchema: TSchema,
    { headers, timeoutMs, abortSignal }: GetOpts = {},
  ): ResultAsync<
    z.infer<TSchema>,
    | { type: 'ABORTED' }
    | { type: 'TIMEOUT' }
    | { type: 'HTTP_ERROR'; error: HttpNetworkError | HttpRequestError | HttpBadResponseError }
  > {
    const signals: AbortSignal[] = [];
    if (timeoutMs) signals.push(AbortSignal.timeout(timeoutMs));
    if (abortSignal) signals.push(abortSignal);
    const signal = signals.length ? AbortSignal.any(signals) : null;

    const request = fetch(url, { headers: { ...DEFAULT_HEADERS, ...headers }, signal });

    const response = ResultAsync.fromPromise(request, (e) => {
      if (e instanceof Error && e.name === 'AbortError') {
        return { type: 'ABORTED' as const };
      }
      if (e instanceof Error && e.name === 'TimeoutError') {
        return { type: 'TIMEOUT' as const };
      }
      return httpErrors.NetworkError(e);
    });

    const checked = response.andThen((resp) => (resp.ok ? ok(resp) : mapResponseToError(resp)));

    const jsonData = checked.andThen((resp) =>
      ResultAsync.fromPromise(resp.json(), () => httpErrors.BadResponse('Failed to parse json')),
    );

    const parsedBody = jsonData.andThen((resp) => {
      const parsed = bodySchema.safeParse(resp);
      return parsed.success
        ? ok(parsed.data)
        : err(httpErrors.BadResponse('Failed to validate body'));
    });

    return parsedBody.mapErr((e) => {
      if (e.type === 'ABORTED' || e.type === 'TIMEOUT') {
        return e;
      }
      return { type: 'HTTP_ERROR', error: e };
    });
  }

  return { httpGet };
}
