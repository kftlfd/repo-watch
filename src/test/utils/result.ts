import { Result, ResultAsync } from 'neverthrow';

/**
 * Asserts that a Result is Ok and returns the value.
 */
export function expectOk<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw new Error(`Expected Ok, but got Err: ${JSON.stringify(result.error)}`);
  }

  return result.value;
}

/**
 * Asserts that a Result is Err and returns the error.
 */
export function expectErr<T, E>(result: Result<T, E>): E {
  if (result.isOk()) {
    throw new Error(`Expected Err, but got Ok: ${JSON.stringify(result.value)}`);
  }

  return result.error;
}

/**
 * Async version for ResultAsync
 */
export async function expectOkAsync<T, E>(result: ResultAsync<T, E>): Promise<T> {
  const resolved = await result;

  if (resolved.isErr()) {
    throw new Error(`Expected Ok, but got Err: ${JSON.stringify(resolved.error)}`);
  }

  return resolved.value;
}

/**
 * Async version for ResultAsync errors
 */
export async function expectErrAsync<T, E>(result: ResultAsync<T, E>): Promise<E> {
  const resolved = await result;

  if (resolved.isOk()) {
    throw new Error(`Expected Err, but got Ok: ${JSON.stringify(resolved.value)}`);
  }

  return resolved.error;
}
