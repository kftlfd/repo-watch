import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MockLogger } from '@/test/mocks.js';
import { createMockLogger } from '@/test/mocks.js';
import { newPromise } from '@/utils/promises.js';

import type { LifecycleHandle, Module } from './runtime.js';
import { createRuntime, createRuntimeStatus, createShutdownController } from './runtime.js';

function createModule(
  name: string,
  options?: {
    onStart?: () => Promise<void> | void;
    onStop?: () => Promise<void> | void;
    exited?: Promise<void>;
  },
): Module {
  return {
    name,

    async start(): Promise<LifecycleHandle> {
      await options?.onStart?.();

      return {
        exited: options?.exited ?? newPromise().promise,
        async stop() {
          await options?.onStop?.();
        },
      };
    },
  };
}

describe('createRuntime', () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts modules in order', async () => {
    const calls: string[] = [];

    const runtime = createRuntime({
      logger,
      runtimeStatus: createRuntimeStatus(),
      modules: [
        createModule('a', {
          onStart: () => {
            calls.push('a');
          },
        }),
        createModule('b', {
          onStart: () => {
            calls.push('b');
          },
        }),
        createModule('c', {
          onStart: () => {
            calls.push('c');
          },
        }),
      ],
    });

    await runtime.start();

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('stops modules in reverse order', async () => {
    const calls: string[] = [];

    const runtime = createRuntime({
      logger,
      runtimeStatus: createRuntimeStatus(),
      modules: [
        createModule('a', {
          onStop: () => {
            calls.push('a');
          },
        }),
        createModule('b', {
          onStop: () => {
            calls.push('b');
          },
        }),
        createModule('c', {
          onStop: () => {
            calls.push('c');
          },
        }),
      ],
    });

    await runtime.start();
    await runtime.stop();

    expect(calls).toEqual(['c', 'b', 'a']);
  });

  it('stops partially-started modules in reverse order when startup fails', async () => {
    const stops: string[] = [];

    const runtime = createRuntime({
      logger,
      runtimeStatus: createRuntimeStatus(),
      modules: [
        createModule('a', {
          onStop: () => {
            stops.push('a');
          },
        }),
        createModule('b', {
          onStop: () => {
            stops.push('b');
          },
        }),
        createModule('c', {
          onStart: () => {
            throw new Error('startup failed');
          },
        }),
      ],
    });

    await expect(runtime.start()).rejects.toThrow(Error);

    await runtime.stop();

    expect(stops).toEqual(['b', 'a']);
  });

  it('waitForExit returns first finished module', async () => {
    const a = newPromise();
    const b = newPromise();

    const runtime = createRuntime({
      logger,
      runtimeStatus: createRuntimeStatus(),
      modules: [
        createModule('a', {
          exited: a.promise,
        }),
        createModule('b', {
          exited: b.promise,
        }),
      ],
    });

    await runtime.start();

    b.resolve();

    await expect(runtime.waitForExit()).resolves.toEqual({
      name: 'b',
      status: 'finished',
    });
  });

  it('waitForExit returns first failed module', async () => {
    const a = newPromise();
    const b = newPromise();

    const error = new Error('boom');

    const runtime = createRuntime({
      logger,
      runtimeStatus: createRuntimeStatus(),
      modules: [
        createModule('a', {
          exited: a.promise,
        }),
        createModule('b', {
          exited: b.promise,
        }),
      ],
    });

    await runtime.start();

    b.reject(error);

    await expect(runtime.waitForExit()).resolves.toEqual({
      name: 'b',
      status: 'failed',
      error,
    });
  });

  it('aggregates stop errors', async () => {
    const errA = new Error('a');
    const errB = new Error('b');

    const runtime = createRuntime({
      logger,
      runtimeStatus: createRuntimeStatus(),
      modules: [
        createModule('a', {
          onStop: () => {
            throw errA;
          },
        }),
        createModule('b', {
          onStop: () => {
            throw errB;
          },
        }),
      ],
    });

    await runtime.start();

    await expect(runtime.stop()).rejects.toThrow(AggregateError);

    try {
      await runtime.stop();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);

      const aggregate = error as AggregateError;

      expect(aggregate.errors).toEqual([errB, errA]);
    }
  });

  it('updates runtime state', async () => {
    const status = createRuntimeStatus();

    const runtime = createRuntime({
      logger,
      runtimeStatus: status,
      modules: [createModule('a')],
    });

    expect(status.getState()).toBe('starting');

    await runtime.start();

    expect(status.getState()).toBe('running');

    await runtime.stop();

    expect(status.getState()).toBe('shutting-down');
  });
});

describe('createShutdownController', () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs shutdown only once', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);

    const controller = createShutdownController({
      logger,
      shutdown,
      timeoutMs: 1000,
    });

    controller.trigger('first');
    controller.trigger('second');
    controller.trigger('third');

    await controller.done;

    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('resolves done after successful shutdown', async () => {
    const controller = createShutdownController({
      logger,
      shutdown: vi.fn().mockResolvedValue(undefined),
      timeoutMs: 1000,
    });

    controller.trigger('sigterm');

    await expect(controller.done).resolves.toBeUndefined();
  });

  it('rejects done with provided error', async () => {
    const error = new Error('failure');

    const controller = createShutdownController({
      logger,
      shutdown: vi.fn().mockResolvedValue(undefined),
      timeoutMs: 1000,
    });

    controller.trigger('failure', error);

    await expect(controller.done).rejects.toBe(error);
  });

  it('rejects when shutdown fails', async () => {
    const error = new Error('shutdown failed');

    const controller = createShutdownController({
      logger,
      shutdown: vi.fn().mockRejectedValue(error),
      timeoutMs: 1000,
    });

    controller.trigger('failure');

    await expect(controller.done).rejects.toBe(error);
  });

  it('rejects on shutdown timeout', async () => {
    vi.useFakeTimers();

    const controller = createShutdownController({
      logger,
      shutdown: () => new Promise(() => {}),
      timeoutMs: 1000,
    });

    controller.trigger('timeout');

    const expErr = expect(controller.done).rejects.toThrow(Error);

    await vi.advanceTimersByTimeAsync(1000);

    await expErr;

    vi.useRealTimers();
  });
});
