import { errAsync, okAsync, ResultAsync } from 'neverthrow';
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

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(1);

    await loop.stop();
    await startPromise;
  });

  it('runs multiple iterations over time', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(3);

    await loop.stop();
    await startPromise;
  });

  it('respects first run delay', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
      getFirstRunDelayMs: () => 2_000,
    });

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(1_100);
    expect(run).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1_100);
    expect(run).toHaveBeenCalledTimes(1);

    await loop.stop();
    await startPromise;
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

    const startPromise = loop.start();

    expect(onStart).toHaveBeenCalledTimes(1);

    await loop.stop();
    await startPromise;
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

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(2_000);

    const metrics = loop.getMetrics();

    expect(metrics.failures).toBe(2);
    expect(metrics.consecutiveErrors).toBe(0);

    await loop.stop();
    await startPromise;
  });

  it('tracks crashes and stops when afterCrashDelayMs is null', async () => {
    const run = vi.fn(() => ResultAsync.fromSafePromise(Promise.reject(new Error('boom'))));

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1000,
      afterCrashDelayMs: null,
    });

    await loop.start();

    const metrics = loop.getMetrics();

    expect(metrics.crashes).toBe(1);
    expect(metrics.failures).toBe(0);
    expect(metrics.totalIterations).toBe(1);
    expect(metrics.isRunning).toBe(false);
  });

  it('retries after crash when afterCrashDelayMs is set', async () => {
    const run = vi
      .fn()
      .mockImplementationOnce(() => ResultAsync.fromSafePromise(Promise.reject(new Error('boom'))))
      .mockImplementation(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
      afterCrashDelayMs: 500,
    });

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(600);
    expect(run).toHaveBeenCalledTimes(2);

    await loop.stop();
    await startPromise;
  });

  it('stop() prevents further iterations', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);

    await loop.stop();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(run).toHaveBeenCalledTimes(1);

    await startPromise;
  });

  it('tracks totalIterations correctly', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 300,
    });

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(10_000);

    const metrics = loop.getMetrics();

    expect(metrics.totalIterations).toBe(run.mock.calls.length);

    await loop.stop();
    await startPromise;
  });

  it('sets startedAt and stoppedAt correctly', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(100);

    const startedAt = loop.getMetrics().startedAt;
    expect(startedAt).not.toBeNull();

    await loop.stop();
    await startPromise;

    const stoppedAt = loop.getMetrics().stoppedAt;
    expect(stoppedAt).not.toBeNull();
  });

  it('returns immutable metrics snapshot', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(5_000);

    const m1 = loop.getMetrics();
    m1.crashes = 999;
    expect(loop.getMetrics().crashes).not.toBe(999);

    const m2 = loop.getMetrics();
    expect(m1).not.toBe(m2);

    await loop.stop();
    await startPromise;
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

    const startPromise = loop.start();

    await vi.advanceTimersByTimeAsync(100);

    await loop.stop();

    expect(receivedSignal?.aborted).toBe(true);

    await startPromise;
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

    const startPromise = loop.start();

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

    await loop.stop();
    await startPromise;
  });

  it('does not start twice', async () => {
    const run = vi.fn(() => okAsync());

    const loop = createLoop({
      log: logger,
      run,
      getNextDelayMs: () => 1_000,
    });

    const p1 = loop.start();

    await vi.advanceTimersByTimeAsync(100);

    const startTime = loop.getMetrics().startedAt;

    await vi.advanceTimersByTimeAsync(1_000);

    const p2 = loop.start();
    expect(logger.warn).toHaveBeenCalledWith('[start] Already running');
    expect(loop.getMetrics().startedAt).toBe(startTime);

    await loop.stop();
    await p1;
    await p2;
  });

  it('stop() when not running does nothing', async () => {
    const loop = createLoop({
      log: logger,
      run: () => okAsync(),
      getNextDelayMs: () => 1000,
    });

    await loop.stop();

    expect(logger.warn).toHaveBeenCalledWith('[stop] Not running');
  });
});
