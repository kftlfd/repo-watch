import { describe, expect, it } from 'vitest';

import { seedRepository, seedToken } from '@/test/integration/seeds.js';

import { createTokenRepo } from './token.repo.js';

describe('token.repo (integration)', () => {
  it('creates a token record', async () => {
    const repo = createTokenRepo();
    const repository = await seedRepository();

    const created = await repo.create({
      tokenHash: 'hash-1',
      email: 'user@example.com',
      repositoryId: repository.id,
      type: 'confirm',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.tokenHash).toBe('hash-1');
    expect(created.type).toBe('confirm');
  });

  it('finds a valid token by hash and type', async () => {
    const repo = createTokenRepo();
    const repository = await seedRepository();
    const token = await seedToken({
      tokenHash: 'hash-2',
      repositoryId: repository.id,
      type: 'unsubscribe',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const found = await repo.findValidByHashAndType('hash-2', 'unsubscribe');

    expect(found).not.toBeNull();
    expect(found?.id).toBe(token.id);
  });

  it('does not return expired or mismatched tokens', async () => {
    const repo = createTokenRepo();
    const repository = await seedRepository();
    await seedToken({
      tokenHash: 'expired-hash',
      repositoryId: repository.id,
      type: 'confirm',
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    await seedToken({
      tokenHash: 'confirm-hash',
      repositoryId: repository.id,
      type: 'confirm',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const expired = await repo.findValidByHashAndType('expired-hash', 'confirm');
    const wrongType = await repo.findValidByHashAndType('confirm-hash', 'unsubscribe');

    expect(expired).toBeNull();
    expect(wrongType).toBeNull();
  });

  it('deletes tokens by id', async () => {
    const repo = createTokenRepo();
    const repository = await seedRepository();
    const token = await seedToken({
      tokenHash: 'delete-me',
      repositoryId: repository.id,
      type: 'confirm',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    await repo.deleteById(token.id);
    const found = await repo.findValidByHashAndType('delete-me', 'confirm');

    expect(found).toBeNull();
  });
});
