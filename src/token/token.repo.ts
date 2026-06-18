import { and, eq, gt } from 'drizzle-orm';
import { err, ok, ResultAsync } from 'neverthrow';

import type { DB } from '@/db/client.js';
import { dbErrors } from '@/db/errors.js';
import { tokens } from '@/db/schema.js';

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type TokenType = Token['type'];

export type TokenRepo = ReturnType<typeof createTokenRepo>;

type Deps = {
  db: DB;
};

export function createTokenRepo({ db }: Deps) {
  function create(data: NewToken) {
    return ResultAsync.fromPromise(db.insert(tokens).values(data).returning(), (e) =>
      dbErrors.DBError(e),
    ).andThen(([row]) =>
      row ? ok(row) : err(dbErrors.DBError(new Error('failed to create token'))),
    );
  }

  function getValidByHashAndType(tokenHash: string, type: TokenType) {
    return ResultAsync.fromPromise(
      db
        .select()
        .from(tokens)
        .where(
          and(
            eq(tokens.tokenHash, tokenHash),
            eq(tokens.type, type),
            gt(tokens.expiresAt, new Date()),
          ),
        )
        .limit(1),
      (e) => dbErrors.DBError(e),
    ).andThen(([row]) => (row ? ok(row) : err(dbErrors.DBNotFound('Token'))));
  }

  function deleteById(id: number) {
    return ResultAsync.fromPromise(db.delete(tokens).where(eq(tokens.id, id)), (e) =>
      dbErrors.DBError(e),
    ).map(() => {});
  }

  return {
    create,
    getValidByHashAndType,
    deleteById,
  };
}
