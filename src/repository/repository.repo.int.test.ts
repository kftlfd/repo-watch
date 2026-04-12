import { describe, expect, it, vi } from 'vitest';

import { createMockCache, createMockLogger } from '@/test/mocks.js';
import { expectOkAsync } from '@/test/utils/result.js';

import { createRepositoryRepo } from './repository.repo.js';

function createTestRepo() {
  const get = vi.fn().mockResolvedValue(null);
  const set = vi.fn().mockResolvedValue(undefined);

  return {
    repo: createRepositoryRepo({
      config: { tagCacheTtlSeconds: 60 },
      cache: createMockCache({ get, set }),
      logger: createMockLogger(),
    }),
    cacheGet: get,
    cacheSet: set,
  };
}

describe('repository.repo (integration)', () => {
  it('creates a repository record', async () => {
    const { repo } = createTestRepo();

    const created = await repo.create({
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      isActive: true,
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.owner).toBe('owner');
    expect(created.name).toBe('repo');
    expect(created.fullName).toBe('owner/repo');
    expect(created.isActive).toBe(true);
    expect(created.lastSeenTag).toBeNull();
  });

  it('fetches a repository by full name', async () => {
    const { repo } = createTestRepo();
    await repo.create({ owner: 'owner', name: 'repo', fullName: 'owner/repo', isActive: true });

    const found = await repo.findByFullName('owner/repo');

    expect(found).not.toBeNull();
    expect(found?.fullName).toBe('owner/repo');
  });

  it('updates repository metadata', async () => {
    const { repo } = createTestRepo();
    const created = await repo.create({
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      isActive: true,
    });
    const lastCheckedAt = new Date('2026-04-12T15:00:00.000Z');

    const updated = await repo.update(created.id, {
      lastSeenTag: 'v2.0.0',
      lastCheckedAt,
      isActive: false,
    });

    expect(updated).not.toBeNull();
    expect(updated?.lastSeenTag).toBe('v2.0.0');
    expect(updated?.lastCheckedAt).toEqual(lastCheckedAt);
    expect(updated?.isActive).toBe(false);
  });

  it('returns null when the repository does not exist', async () => {
    const { repo } = createTestRepo();

    const found = await repo.findByFullName('missing/repo');

    expect(found).toBeNull();
  });

  it('finds active repositories for scanning ordered by lastCheckedAt', async () => {
    const { repo } = createTestRepo();
    await repo.create({ owner: 'owner', name: 'a', fullName: 'owner/a', isActive: true });
    const second = await repo.create({
      owner: 'owner',
      name: 'b',
      fullName: 'owner/b',
      isActive: true,
      lastCheckedAt: new Date('2026-04-12T12:00:00.000Z'),
    });
    await repo.create({
      owner: 'owner',
      name: 'c',
      fullName: 'owner/c',
      isActive: false,
      lastCheckedAt: new Date('2026-04-12T11:00:00.000Z'),
    });

    const batch = await repo.findBatchForScanning(10);

    expect(batch).toHaveLength(2);
    expect(batch[0]?.fullName).toBe('owner/a');
    expect(batch[1]?.id).toBe(second.id);
  });

  it('updates scan timestamps and latest tag, and falls back to DB for getLatestTag', async () => {
    const { repo, cacheGet, cacheSet } = createTestRepo();
    const created = await repo.create({
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      isActive: true,
    });
    const lastCheckedAt = new Date('2026-04-12T16:00:00.000Z');

    await repo.updateAfterScan(created.id, lastCheckedAt, 'v3.0.0');
    const latestTag = await expectOkAsync(repo.getLatestTag(created.id));
    const refreshed = await repo.findByFullName('owner/repo');

    expect(cacheGet).toHaveBeenCalledWith(`repo:${created.id.toString()}:latest_tag`);
    expect(cacheSet).toHaveBeenCalledWith(`repo:${created.id.toString()}:latest_tag`, 'v3.0.0', 60);
    expect(latestTag).toBe('v3.0.0');
    expect(refreshed?.lastCheckedAt).toEqual(lastCheckedAt);
    expect(refreshed?.lastSeenTag).toBe('v3.0.0');
  });
});
