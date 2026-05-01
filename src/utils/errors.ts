type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export function defineError<TType extends string, TArgs extends unknown[], TResult extends object>(
  type: TType,
  build?: (...args: TArgs) => TResult,
) {
  return (...args: TArgs) =>
    ({
      type,
      ...(build ? build(...args) : {}),
    }) as Prettify<{ type: TType } & TResult>;
}

export type AppError =
  | { type: 'Validation'; message: string }
  | { type: 'NotFound'; message: string }
  | { type: 'Conflict'; message: string }
  | { type: 'External'; service: 'github' | 'email'; message: string }
  | { type: 'Internal'; message: string }
  | {
      type: 'RateLimited';
      service: 'github' | 'email';
      message: string;
      retryAfterSeconds: number | null;
    };

export function mapErrorToHttp(error: AppError): number {
  switch (error.type) {
    case 'Validation':
      return 400;
    case 'NotFound':
      return 404;
    case 'Conflict':
      return 409;
    case 'External':
      return 502;
    case 'Internal':
      return 500;
    case 'RateLimited':
      return 503;
    default:
      error satisfies never;
      return 500;
  }
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }
  return {
    type: 'Internal',
    message: error instanceof Error ? error.message : 'Unknown error',
  };
}

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof (error as Record<string, unknown>)['type'] === 'string'
  );
}

export type HttpError =
  | { type: 'NetworkError'; message: string }
  | { type: 'NotFound'; message: string }
  | { type: 'BadResponse'; message: string }
  | { type: 'Unauthorized'; message: string }
  | { type: 'TooManyRequests'; retryAfterSeconds: number | null }
  | { type: 'Unknown'; statusCode: number; message: string };
