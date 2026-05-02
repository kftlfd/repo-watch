import type { Branded } from '@/utils/brand.js';
import { defineError } from '@/utils/errors.js';

const _DBError = defineError('DBError', (cause?: unknown) => ({ cause }));
export type DBError = Branded<ReturnType<typeof _DBError>, 'DBError'>;
const DBError = _DBError as (...p: Parameters<typeof _DBError>) => DBError;

const _DBNotFound = defineError('DBNotFound', (entity: string, meta?: unknown) => ({
  entity,
  meta,
}));
export type DBNotFoundError = Branded<ReturnType<typeof _DBNotFound>, 'DBNotFound'>;
const DBNotFound = _DBNotFound as (...p: Parameters<typeof _DBNotFound>) => DBNotFoundError;

abstract class BaseError {
  abstract readonly type: string;
}

class DBError4 extends BaseError {
  readonly type = 'DBError';
  constructor(readonly cause?: unknown) {
    super();
  }
}

const e = new DBError4();

export const dbErrors = {
  DBError,
  DBNotFound,
} as const;
