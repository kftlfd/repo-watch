import { createHmac, randomBytes } from 'crypto';
import { err, ok, ResultAsync } from 'neverthrow';

import type { Token, TokenRepo } from '@/token/token.repo.js';
import type { AppError } from '@/utils/errors.js';
import { env } from '@/config/env.js';
import { toAppError } from '@/utils/errors.js';

export type TokenType = 'confirm' | 'unsubscribe';

interface CreateTokenOptions {
  email: string;
  repositoryId: number;
  type: TokenType;
}

export type TokenService = {
  createToken(options: CreateTokenOptions): Promise<{
    token: string;
    tokenHash: string;
  }>;
  validateToken(token: string, type: TokenType): ResultAsync<Token, AppError>;
  getTokenUrl(token: string, type: TokenType): string;
  deleteToken(tokenId: number): Promise<void>;
};

const TOKEN_EXPIRY_HOURS = 24;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHmac('sha256', env.SERVER_SECRET).update(token).digest('hex');
}

export function createTokenService(tokenRepo: TokenRepo): TokenService {
  async function createToken(
    options: CreateTokenOptions,
  ): Promise<{ token: string; tokenHash: string }> {
    const token = generateToken();
    const tokenHash = hashToken(token);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    await tokenRepo.create({
      tokenHash,
      email: options.email,
      repositoryId: options.repositoryId,
      type: options.type,
      expiresAt,
    });

    return { token, tokenHash };
  }

  function validateToken(token: string, type: TokenType): ResultAsync<Token, AppError> {
    const tokenHash = hashToken(token);

    return ResultAsync.fromPromise(
      tokenRepo.findValidByHashAndType(tokenHash, type),
      toAppError,
    ).andThen((found) => {
      if (!found) {
        return err({ type: 'NotFound', message: 'Invalid or expired token' } as AppError);
      }
      return ok(found);
    });
  }

  function getTokenUrl(token: string, type: TokenType): string {
    const path = type === 'confirm' ? '/confirm' : '/unsubscribe';
    return `${env.BASE_URL}${path}/${token}`;
  }

  async function deleteToken(tokenId: number): Promise<void> {
    await tokenRepo.deleteById(tokenId);
  }

  return {
    createToken,
    validateToken,
    getTokenUrl,
    deleteToken,
  };
}
