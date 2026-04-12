import { describe, expect, it } from 'vitest';

import { seedRepository, seedSubscription } from '@/test/integration/seeds.js';

import { createSubscriptionRepo } from './subscription.repo.js';

describe('subscription.repo (integration)', () => {
  it('inserts a subscription into the database', async () => {
    const repo = createSubscriptionRepo();
    const repository = await seedRepository();

    const created = await repo.create({
      email: 'user@example.com',
      repositoryId: repository.id,
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.email).toBe('user@example.com');
    expect(created.repositoryId).toBe(repository.id);
    expect(created.confirmedAt).toBeNull();
    expect(created.removedAt).toBeNull();
  });

  it('finds an active subscription by email and repository id', async () => {
    const repo = createSubscriptionRepo();
    const repository = await seedRepository();
    const seeded = await seedSubscription({
      email: 'user@example.com',
      repositoryId: repository.id,
    });

    const found = await repo.findActiveByEmailAndRepoId('user@example.com', repository.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(seeded.id);
  });

  it('updates subscription confirmation status', async () => {
    const repo = createSubscriptionRepo();
    const repository = await seedRepository();
    const seeded = await seedSubscription({ repositoryId: repository.id });
    const confirmedAt = new Date('2026-04-12T12:30:00.000Z');

    const updated = await repo.update(seeded.id, { confirmedAt, removedAt: null });

    expect(updated).not.toBeNull();
    expect(updated?.confirmedAt).toEqual(confirmedAt);
    expect(updated?.removedAt).toBeNull();
  });

  it('soft deletes subscriptions', async () => {
    const repo = createSubscriptionRepo();
    const repository = await seedRepository();
    const seeded = await seedSubscription({ repositoryId: repository.id });

    const deleted = await repo.softDelete(seeded.id);
    const found = await repo.findActiveByEmailAndRepoId(seeded.email, repository.id);

    expect(deleted).not.toBeNull();
    expect(deleted?.removedAt).toBeInstanceOf(Date);
    expect(found).toBeNull();
  });

  it('returns confirmed subscriptions in batches using the cursor', async () => {
    const repo = createSubscriptionRepo();
    const repository = await seedRepository();
    await seedSubscription({ email: 'pending@example.com', repositoryId: repository.id });
    const first = await seedSubscription({
      email: 'a@example.com',
      repositoryId: repository.id,
      confirmedAt: new Date('2026-04-12T10:00:00.000Z'),
    });
    const second = await seedSubscription({
      email: 'b@example.com',
      repositoryId: repository.id,
      confirmedAt: new Date('2026-04-12T11:00:00.000Z'),
    });

    const firstBatch = await repo.getConfirmedByRepositoryIdBatch(repository.id, -1, 1);
    const secondBatch = await repo.getConfirmedByRepositoryIdBatch(repository.id, first.id, 10);

    expect(firstBatch.map((sub) => sub.email)).toEqual(['a@example.com']);
    expect(secondBatch.map((sub) => sub.email)).toEqual(['b@example.com']);
    expect(secondBatch[0]?.id).toBe(second.id);
  });

  it('returns active subscriptions for an email joined with repository data', async () => {
    const repo = createSubscriptionRepo();
    const repository = await seedRepository({ fullName: 'owner/repo', lastSeenTag: 'v2.0.0' });
    await seedSubscription({
      email: 'user@example.com',
      repositoryId: repository.id,
      confirmedAt: new Date('2026-04-12T09:00:00.000Z'),
    });
    await seedSubscription({
      email: 'user@example.com',
      repositoryId: repository.id,
      removedAt: new Date('2026-04-12T10:00:00.000Z'),
    });

    const subscriptions = await repo.getSubscriptionsForEmail('user@example.com');

    expect(subscriptions).toEqual([
      {
        email: 'user@example.com',
        repo: 'owner/repo',
        confirmed: true,
        last_seen_tag: 'v2.0.0',
      },
    ]);
  });
});
