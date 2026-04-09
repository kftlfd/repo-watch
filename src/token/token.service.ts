import { createHmac, randomBytes } from 'crypto';
import { err, ok, ResultAsync } from 'neverthrow';

import { env } from '@/config/env.js';
import * as tokenRepo from '@/token/token.repo.js';
import { AppError, toAppError } from '@/utils/errors.js';

export type TokenType = 'confirm' | 'unsubscribe';

interface CreateTokenOptions {
  email: string;
  repositoryId: number;
  type: TokenType;
}

const TOKEN_EXPIRY_HOURS = 24;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHmac('sha256', env.SERVER_SECRET).update(token).digest('hex');
}

export async function createToken(
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

export function validateToken(
  token: string,
  type: TokenType,
): ResultAsync<tokenRepo.Token, AppError> {
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

export function getTokenUrl(token: string, type: TokenType): string {
  const path = type === 'confirm' ? '/confirm' : '/unsubscribe';
  return `${env.BASE_URL}${path}/${token}`;
}

export async function deleteToken(tokenId: number): Promise<void> {
  await tokenRepo.deleteById(tokenId);
}
