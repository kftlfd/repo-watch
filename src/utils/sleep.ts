export function sleep(timeMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(onResolve, timeMs);

    signal?.addEventListener('abort', onAbort, { once: true });

    function onResolve() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }

    function onAbort() {
      clearTimeout(timeout);
      resolve();
    }
  });
}
