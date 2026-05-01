import { defineError } from '@/utils/errors.js';

export const dbErrors = {
  DBError: defineError('DBError', (cause?: unknown) => ({ cause })),
  DBNotFound: defineError('DBNotFound', (entity: string, meta?: unknown) => ({
    entity,
    meta,
  })),
} as const;

export type DBError = ReturnType<typeof dbErrors.DBError>;
export type DBNotFoundError = ReturnType<typeof dbErrors.DBNotFound>;
