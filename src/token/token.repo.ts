import { and, eq, gt } from 'drizzle-orm';

import { db } from '@/db/client.js';
import { tokens } from '@/db/schema.js';

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type TokenType = 'confirm' | 'unsubscribe';

export async function findByHash(tokenHash: string) {
  const [row] = await db.select().from(tokens).where(eq(tokens.tokenHash, tokenHash)).limit(1);
  return row ?? null;
}

export async function findValidByHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(tokens)
    .where(and(eq(tokens.tokenHash, tokenHash), gt(tokens.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function findValidByHashAndType(tokenHash: string, type: TokenType) {
  const [row] = await db
    .select()
    .from(tokens)
    .where(
      and(eq(tokens.tokenHash, tokenHash), eq(tokens.type, type), gt(tokens.expiresAt, new Date())),
    )
    .limit(1);
  return row ?? null;
}

export async function create(data: NewToken) {
  const [row] = await db.insert(tokens).values(data).returning();
  return row;
}

export async function deleteById(id: number) {
  await db.delete(tokens).where(eq(tokens.id, id));
}
