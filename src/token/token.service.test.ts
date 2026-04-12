import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TokenServiceConfig } from '@/config/config.js';
import { createTokenRecord } from '@/test/factories.js';
import { createMockTokenRepo } from '@/test/mocks.js';
import { expectErrAsync, expectOkAsync } from '@/test/utils/result.js';

import type { Token } from './token.repo.js';
import { createTokenService } from './token.service.js';

describe('token.service', () => {
  const fixedNow = new Date('2026-04-12T12:00:00.000Z');
  const config: TokenServiceConfig = {
    baseUrl: 'http://localhost:3000',
    serverSecret: 'test-secret',
    tokenExpiryHours: 24,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('createToken stores the hashed token and returns the raw token', async () => {
    const create = vi.fn().mockResolvedValue(createTokenRecord());
    const tokenRepo = createMockTokenRepo({ create });
    const service = createTokenService({ config, tokenRepo });

    const token = await service.createToken({
      email: 'user@example.com',
      repositoryId: 1,
      type: 'confirm',
    });

    const expectedHash = createHmac('sha256', config.serverSecret).update(token).digest('hex');
    const createCall = create.mock.calls[0] as [Token] | undefined;

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(create).toHaveBeenCalledWith({
      tokenHash: expectedHash,
      email: 'user@example.com',
      repositoryId: 1,
      type: 'confirm',
      expiresAt: new Date('2026-04-13T12:00:00.000Z'),
    });
    expect(createCall?.[0].tokenHash).not.toBe(token);
  });

  it('validateToken hashes the incoming token and queries by hash and type', async () => {
    const rawToken = 'raw-token';
    const expectedHash = createHmac('sha256', config.serverSecret).update(rawToken).digest('hex');
    const storedToken = createTokenRecord({ type: 'confirm' });
    const findValidByHashAndType = vi.fn().mockResolvedValue(storedToken);
    const tokenRepo = createMockTokenRepo({ findValidByHashAndType });
    const service = createTokenService({ config, tokenRepo });

    const result = await expectOkAsync(service.validateToken(rawToken, 'confirm'));

    expect(result).toEqual(storedToken);
    expect(findValidByHashAndType).toHaveBeenCalledWith(expectedHash, 'confirm');
  });

  it('validateToken returns NotFound for missing or expired tokens', async () => {
    const findValidByHashAndType = vi.fn().mockResolvedValue(null);
    const tokenRepo = createMockTokenRepo({ findValidByHashAndType });
    const service = createTokenService({ config, tokenRepo });

    const error = await expectErrAsync(service.validateToken('missing-token', 'confirm'));

    expect(error).toEqual({ type: 'NotFound', message: 'Invalid or expired token' });
  });

  it('getTokenUrls builds confirm API and HTML URLs from config.baseUrl', () => {
    const token = 'abc123';
    const service = createTokenService({ config, tokenRepo: createMockTokenRepo() });

    const urls = service.getTokenUrls(token, 'confirm');

    expect(urls).toEqual({
      apiUrl: `${config.baseUrl}/api/confirm/${token}`,
      htmlUrl: `${config.baseUrl}/confirm/${token}`,
    });
  });

  it('getTokenUrls builds unsubscribe API and HTML URLs from config.baseUrl', () => {
    const token = 'abc123';
    const service = createTokenService({ config, tokenRepo: createMockTokenRepo() });

    const urls = service.getTokenUrls(token, 'unsubscribe');

    expect(urls).toEqual({
      apiUrl: `${config.baseUrl}/api/unsubscribe/${token}`,
      htmlUrl: `${config.baseUrl}/unsubscribe/${token}`,
    });
  });

  it('deleteToken delegates to tokenRepo.deleteById', async () => {
    const deleteById = vi.fn().mockResolvedValue(undefined);
    const tokenRepo = createMockTokenRepo({ deleteById });
    const service = createTokenService({ config, tokenRepo });

    await service.deleteToken(42);

    expect(deleteById).toHaveBeenCalledWith(42);
  });
});
