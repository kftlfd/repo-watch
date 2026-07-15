import { createHmac, randomBytes } from 'crypto';

import type { TokenServiceConfig } from '@/config/config.js';
import type { TokenRepo } from '@/token/token.repo.js';

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

export type TokenService = ReturnType<typeof createTokenService>;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

type Deps = {
  config: TokenServiceConfig;
  tokenRepo: TokenRepo;
};

export function createTokenService({ config, tokenRepo }: Deps) {
  function hashToken(token: string): string {
    return createHmac('sha256', config.serverSecret).update(token).digest('hex');
  }

  function createToken(options: CreateTokenOptions) {
    const token = generateToken();
    const tokenHash = hashToken(token);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.tokenExpiryHours);

    return tokenRepo
      .create({
        tokenHash,
        email: options.email,
        repositoryId: options.repositoryId,
        type: options.type,
        expiresAt,
      })
      .map(() => token);
  }

  function validateToken(token: string, type: TokenType) {
    const tokenHash = hashToken(token);
    return tokenRepo.getValidByHashAndType(tokenHash, type);
  }

  function getTokenUrls(token: string, type: TokenType): TokenUrls {
    const apiPath = type === 'confirm' ? '/api/confirm' : '/api/unsubscribe';
    const htmlPath = type === 'confirm' ? '/confirm' : '/unsubscribe';
    return {
      apiUrl: `${config.baseUrl}${apiPath}/${token}`,
      htmlUrl: `${config.baseUrl}${htmlPath}/${token}`,
    };
  }

  function deleteToken(tokenId: number) {
    return tokenRepo.deleteById(tokenId);
  }

  return {
    createToken,
    validateToken,
    getTokenUrls,
    deleteToken,
  };
}
