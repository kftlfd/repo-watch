import { describe, expect, it } from 'vitest';

import { seedRepository, seedToken } from '@/test/integration/seeds.js';
import { db } from '@/test/integration/setup.js';
import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';

import { createTokenRepo } from './token.repo.js';

describe('token.repo (integration)', () => {
  it('creates a token record', async () => {
    const repo = createTokenRepo({ db });
    const repository = await seedRepository(db);

    const created = await expectOkAsync(
      repo.create({
        tokenHash: 'hash-1',
        email: 'user@example.com',
        repositoryId: repository.id,
        type: 'confirm',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
    );

    expect(created.id).toBeGreaterThan(0);
    expect(created.tokenHash).toBe('hash-1');
    expect(created.type).toBe('confirm');
  });

  it('finds a valid token by hash and type', async () => {
    const repo = createTokenRepo({ db });
    const repository = await seedRepository(db);
    const token = await seedToken(db, {
      tokenHash: 'hash-2',
      repositoryId: repository.id,
      type: 'unsubscribe',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const found = await expectOkAsync(repo.getValidByHashAndType('hash-2', 'unsubscribe'));

    expect(found).not.toBeNull();
    expect(found.id).toBe(token.id);
  });

  it('does not return expired or mismatched tokens', async () => {
    const repo = createTokenRepo({ db });
    const repository = await seedRepository(db);
    await seedToken(db, {
      tokenHash: 'expired-hash',
      repositoryId: repository.id,
      type: 'confirm',
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    await seedToken(db, {
      tokenHash: 'confirm-hash',
      repositoryId: repository.id,
      type: 'confirm',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const expired = await expectErrAsync(repo.getValidByHashAndType('expired-hash', 'confirm'));
    const wrongType = await expectErrAsync(
      repo.getValidByHashAndType('confirm-hash', 'unsubscribe'),
    );

    expect(expired.type === 'DBNotFound');
    expect(wrongType.type === 'DBNotFound');
  });

  it('deletes tokens by id', async () => {
    const repo = createTokenRepo({ db });
    const repository = await seedRepository(db);
    const token = await seedToken(db, {
      tokenHash: 'delete-me',
      repositoryId: repository.id,
      type: 'confirm',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    await repo.deleteById(token.id);
    const res = await expectErrAsync(repo.getValidByHashAndType('delete-me', 'confirm'));

    expect(res.type === 'DBNotFound');
  });
});
