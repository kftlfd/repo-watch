import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '@/config/config.js';
import type { MockLogger } from '@/test/mocks.js';
import { createMockLogger } from '@/test/mocks.js';
import { newPromise } from '@/utils/promises.js';

import { createRuntime, createRuntimeStatus, defineModule } from './runtime.js';

function createConfig(timeout = 1000): RuntimeConfig {
  return {
    shutdownTimeoutMs: timeout,
  };
}

describe('defineModule', () => {
  it('calls start callback', async () => {
    const start = vi.fn();

    const module = defineModule('test', { start });

    await module.start();

    expect(start).toHaveBeenCalledTimes(1);
  });

  it('calls stop callback', async () => {
    const stop = vi.fn();

    const module = defineModule('test', { stop });

    const handle = await module.start();

    await handle.stop();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('exits when exit() is called', async () => {
    let exit!: () => void;

    const module = defineModule('test', {
      start(args) {
        exit = args.exit;
      },
    });

    const handle = await module.start();

    exit();

    await expect(handle.exited).resolves.toBeUndefined();
  });

  it('fails when fail() is called', async () => {
    let fail!: (error: unknown) => void;

    const module = defineModule('test', {
      start(args) {
        fail = args.fail;
      },
    });

    const handle = await module.start();

    const error = new Error('boom');

    fail(error);

    await expect(handle.exited).rejects.toBe(error);
  });

  it('watches promise resolution', async () => {
    const task = newPromise();

    const module = defineModule('test', {
      start({ watch }) {
        watch(task.promise);
      },
    });

    const handle = await module.start();

    task.resolve();

    await expect(handle.exited).resolves.toBeUndefined();
  });

  it('watches promise rejection', async () => {
    const task = newPromise();

    const module = defineModule('test', {
      start({ watch }) {
        watch(task.promise);
      },
    });

    const handle = await module.start();

    const error = new Error('boom');

    task.reject(error);

    await expect(handle.exited).rejects.toBe(error);
  });

  it('stop resolves exited before returning', async () => {
    const module = defineModule('test', {});

    const handle = await module.start();

    await handle.stop();

    await expect(handle.exited).resolves.toBeUndefined();
  });
});

describe('createRuntime', () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rejects when no modules are provided', async () => {
    const { controller } = createRuntimeStatus();

    const runtime = createRuntime({
      config: createConfig(),
      logger,
      modules: [],
      runtimeStatus: controller,
    });

    await expect(runtime.run()).rejects.toThrow('no modules to run');
  });

  it('starts modules in order', async () => {
    const started: string[] = [];

    const runtime = createRuntime({
      config: createConfig(),
      logger,
      runtimeStatus: createRuntimeStatus().controller,
      modules: [
        defineModule('a', {
          start() {
            started.push('a');
          },
        }),
        defineModule('b', {
          start() {
            started.push('b');
          },
        }),
      ],
    });

    runtime.shutdown('test');

    await runtime.run().catch(() => {});

    expect(started).toEqual(['a', 'b']);
  });

  it('stops modules in reverse order', async () => {
    const stopped: string[] = [];

    const runtime = createRuntime({
      config: createConfig(),
      logger,
      runtimeStatus: createRuntimeStatus().controller,
      modules: [
        defineModule('a', {
          stop() {
            stopped.push('a');
          },
        }),
        defineModule('b', {
          stop() {
            stopped.push('b');
          },
        }),
      ],
    });

    const runPromise = runtime.run();

    runtime.shutdown('test');

    await runPromise;

    expect(stopped).toEqual(['b', 'a']);
  });

  it('stops already-started modules when startup fails', async () => {
    const stopped: string[] = [];

    const runtime = createRuntime({
      config: createConfig(),
      logger,
      runtimeStatus: createRuntimeStatus().controller,
      modules: [
        defineModule('a', {
          stop() {
            stopped.push('a');
          },
        }),
        defineModule('b', {
          start() {
            throw new Error('startup failed');
          },
        }),
      ],
    });

    await expect(runtime.run()).rejects.toThrow(Error);

    expect(stopped).toEqual(['a']);
  });

  it('stops partially-started modules in reverse order when startup fails', async () => {
    const stopped: string[] = [];

    const runtime = createRuntime({
      config: createConfig(),
      logger,
      runtimeStatus: createRuntimeStatus().controller,
      modules: [
        defineModule('a', {
          stop() {
            stopped.push('a');
          },
        }),
        defineModule('b', {
          stop() {
            stopped.push('b');
          },
        }),
        defineModule('c', {
          start() {
            throw new Error('startup failed');
          },
        }),
      ],
    });

    await expect(runtime.run()).rejects.toThrow(Error);

    expect(stopped).toEqual(['b', 'a']);
  });

  it('rejects when module exits unexpectedly', async () => {
    let exit!: () => void;

    const runtime = createRuntime({
      config: createConfig(),
      logger,
      runtimeStatus: createRuntimeStatus().controller,
      modules: [
        defineModule('worker', {
          start(args) {
            exit = args.exit;
          },
        }),
      ],
    });

    const runPromise = runtime.run();

    exit();

    await expect(runPromise).rejects.toThrow(Error);
  });

  it('rejects when module fails', async () => {
    let fail!: (error: unknown) => void;

    const runtime = createRuntime({
      config: createConfig(),
      logger,
      runtimeStatus: createRuntimeStatus().controller,
      modules: [
        defineModule('worker', {
          start(args) {
            fail = args.fail;
          },
        }),
      ],
    });

    const runPromise = runtime.run();

    fail(new Error('boom'));

    await expect(runPromise).rejects.toThrow(Error);
  });

  it('aggregates stop errors', async () => {
    const runtime = createRuntime({
      config: createConfig(),
      logger,
      runtimeStatus: createRuntimeStatus().controller,
      modules: [
        defineModule('a', {
          stop() {
            throw new Error('a');
          },
        }),
        defineModule('b', {
          stop() {
            throw new Error('b');
          },
        }),
      ],
    });

    const runPromise = runtime.run();

    runtime.shutdown('test');

    await expect(runPromise).rejects.toThrow(AggregateError);
  });

  it('can shutdown while startup is still in progress', async () => {
    vi.useFakeTimers();
    const startup = newPromise();
    let fastStopped = false;

    const runtime = createRuntime({
      config: createConfig(10_000),
      logger,
      runtimeStatus: createRuntimeStatus().controller,
      modules: [
        defineModule('fast', {
          stop() {
            fastStopped = true;
          },
        }),
        defineModule('slow', {
          async start() {
            await startup.promise;
          },
        }),
      ],
    });

    const runPromise = runtime.run();

    runtime.shutdown('SIGTERM');

    await vi.advanceTimersByTimeAsync(1000);

    expect(fastStopped).toBe(false);

    startup.resolve();

    await runPromise;

    expect(fastStopped).toBe(true);
  });
});
