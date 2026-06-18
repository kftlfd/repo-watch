export function newPromise<T = void>() {
  return Promise.withResolvers<T>();
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: unknown,
): Promise<T> {
  const timeout = Promise.withResolvers<never>();

  const timeoutId = setTimeout(() => {
    timeout.reject(timeoutError);
  }, timeoutMs);

  return Promise.race([
    promise.finally(() => {
      clearTimeout(timeoutId);
    }),
    timeout.promise,
  ]);
}
