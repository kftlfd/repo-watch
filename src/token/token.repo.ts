import { and, eq, gt } from 'drizzle-orm';

import { db } from '@/db/client.js';
import { tokens } from '@/db/schema.js';

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type TokenType = 'confirm' | 'unsubscribe';

export type TokenRepo = {
  create(data: NewToken): Promise<Token>;
  findValidByHashAndType(tokenHash: string, type: TokenType): Promise<Token | null>;
  deleteById(id: number): Promise<void>;
};

async function findValidByHashAndType(tokenHash: string, type: TokenType) {
  const [row] = await db
    .select()
    .from(tokens)
    .where(
      and(eq(tokens.tokenHash, tokenHash), eq(tokens.type, type), gt(tokens.expiresAt, new Date())),
    )
    .limit(1);
  return row ?? null;
}

async function create(data: NewToken) {
  const [row] = await db.insert(tokens).values(data).returning();
  if (!row) throw new Error('DB error: failed to create token');
  return row;
}

async function deleteById(id: number) {
  await db.delete(tokens).where(eq(tokens.id, id));
}

export function createTokenRepo(): TokenRepo {
  return {
    create,
    findValidByHashAndType,
    deleteById,
  };
}
