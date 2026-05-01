import { createHmac, randomBytes } from 'crypto';
import { ResultAsync } from 'neverthrow';

import type { TokenServiceConfig } from '@/config/config.js';
import type { Token, TokenRepo } from '@/token/token.repo.js';
import type { AppError } from '@/utils/errors.js';

export type TokenType = 'confirm' | 'unsubscribe';

interface CreateTokenOptions {
  email: string;
  repositoryId: number;
  type: TokenType;
}

export type TokenUrls = {
  apiUrl: string;
  htmlUrl: string;
};

export type TokenService = {
  createToken(options: CreateTokenOptions): Promise<string>;
  validateToken(token: string, type: TokenType): ResultAsync<Token, AppError>;
  getTokenUrls(token: string, type: TokenType): TokenUrls;
  deleteToken(tokenId: number): Promise<void>;
};

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

type Deps = {
  config: TokenServiceConfig;
  tokenRepo: TokenRepo;
};

export function createTokenService({ config, tokenRepo }: Deps): TokenService {
  function hashToken(token: string): string {
    return createHmac('sha256', config.serverSecret).update(token).digest('hex');
  }

  async function createToken(options: CreateTokenOptions): Promise<string> {
    const token = generateToken();
    const tokenHash = hashToken(token);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.tokenExpiryHours);

    await tokenRepo.create({
      tokenHash,
      email: options.email,
      repositoryId: options.repositoryId,
      type: options.type,
      expiresAt,
    });

    return token;
  }

  function validateToken(token: string, type: TokenType): ResultAsync<Token, AppError> {
    const tokenHash = hashToken(token);

    return tokenRepo.getValidByHashAndType(tokenHash, type).mapErr((e): AppError => {
      switch (e.type) {
        case 'DBError':
          return { type: 'Internal', message: 'DB error' };
        case 'DBNotFound':
          return { type: 'NotFound', message: 'Invalid or expired token' };
        default:
          e satisfies never;
          throw new Error('unhandled Err Result');
      }
    });
  }

  function getTokenUrls(token: string, type: TokenType): TokenUrls {
    const apiPath = type === 'confirm' ? '/api/confirm' : '/api/unsubscribe';
    const htmlPath = type === 'confirm' ? '/confirm' : '/unsubscribe';
    return {
      apiUrl: `${config.baseUrl}${apiPath}/${token}`,
      htmlUrl: `${config.baseUrl}${htmlPath}/${token}`,
    };
  }

  async function deleteToken(tokenId: number): Promise<void> {
    await tokenRepo.deleteById(tokenId);
  }

  return {
    createToken,
    validateToken,
    getTokenUrls,
    deleteToken,
  };
}
