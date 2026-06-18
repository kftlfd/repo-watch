import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@/logger/logger.js';
import { createMockLogger } from '@/test/mocks.js';

import type { LoopOptions } from './loop.js';
import { createLoop } from './loop.js';

describe('loop', () => {
  let logger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts and runs at least one iteration', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(1);

    await handle.stop();
    await handle.promise;
  });

  it('runs multiple iterations over time', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(3);

    await handle.stop();
    await handle.promise;
  });

  it('respects first run delay', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
      getFirstRunDelayMs: () => 2_000,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(1_100);
    expect(run).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1_100);
    expect(run).toHaveBeenCalledTimes(1);

    await handle.stop();
    await handle.promise;
  });

  it('calls onStart once', async () => {
    const onStart = vi.fn();

    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1000,
      onStart,
    });

    const handle = loop.start();

    expect(onStart).toHaveBeenCalledTimes(1);

    await handle.stop();
    await handle.promise;
  });

  it('tracks failures and resets consecutiveErrors on success', async () => {
    const run = vi
      .fn()
      .mockImplementationOnce(() => errAsync())
      .mockImplementationOnce(() => errAsync())
      .mockImplementationOnce(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(2_000);

    const metrics = handle.getMetrics();

    expect(metrics.failures).toBe(2);
    expect(metrics.consecutiveErrors).toBe(0);

    await handle.stop();
    await handle.promise;
  });

  it('stop() prevents further iterations', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);

    await handle.stop();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(run).toHaveBeenCalledTimes(1);

    await handle.promise;
  });

  it('tracks totalIterations correctly', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 300,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(10_000);

    const metrics = handle.getMetrics();

    expect(metrics.totalIterations).toBe(run.mock.calls.length);

    await handle.stop();
    await handle.promise;
  });

  it('sets startedAt and stoppedAt correctly', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(100);

    const startedAt = handle.getMetrics().startedAt;
    expect(startedAt).not.toBeNull();

    await handle.stop();
    await handle.promise;

    const stoppedAt = handle.getMetrics().stoppedAt;
    expect(stoppedAt).not.toBeNull();
  });

  it('returns immutable metrics snapshot', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(5_000);

    const m1 = handle.getMetrics();
    m1.failures = 999;
    expect(handle.getMetrics().failures).not.toBe(999);

    const m2 = handle.getMetrics();
    expect(m1).not.toBe(m2);

    await handle.stop();
    await handle.promise;
  });

  it('passes abort signal to run and aborts it on stop', async () => {
    let receivedSignal: AbortSignal | undefined;

    const run = vi.fn((signal: AbortSignal) => {
      receivedSignal = signal;
      return okAsync();
    });

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(100);

    await handle.stop();

    expect(receivedSignal?.aborted).toBe(true);

    await handle.promise;
  });

  it('passes correct context to getNextDelayMs', async () => {
    type Args = Parameters<LoopOptions<void, void>['getNextDelayMs']>;

    const getNextDelayMs = vi.fn(() => 1_000);

    const run = vi
      .fn()
      .mockImplementationOnce(() => errAsync())
      .mockImplementationOnce(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs,
    });

    const handle = loop.start();

    await vi.advanceTimersByTimeAsync(100);

    const args1 = getNextDelayMs.mock.calls.at(-1) as Args | undefined;
    expect(args1?.[0].runResult.isErr()).toBe(true);
    expect(args1?.[0].consecutiveErrors).toBe(1);
    expect(args1?.[0].iteration).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);

    const args2 = getNextDelayMs.mock.calls.at(-1) as Args | undefined;
    expect(args2?.[0].runResult.isOk()).toBe(true);
    expect(args2?.[0].consecutiveErrors).toBe(0);
    expect(args2?.[0].iteration).toBe(2);

    await handle.stop();
    await handle.promise;
  });
});
