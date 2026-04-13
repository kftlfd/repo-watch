import type { PrettyOptions } from 'pino-pretty';
import pino from 'pino';

import { env } from '@/config/env.js';

export type Logger = pino.Logger;

export function createLogger(): Logger {
  return pino({
    transport:
      env.NODE_ENV === 'dev'
        ? {
            target: 'pino-pretty',
            options: { colorize: true } satisfies PrettyOptions,
          }
        : undefined,
  });
}
