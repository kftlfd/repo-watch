import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client.js';
import { repositories } from '@/db/schema.js';

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export async function findById(id: number) {
  const [row] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
  return row ?? null;
}

export async function findByFullName(fullName: string) {
  const [row] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.fullName, fullName))
    .limit(1);
  return row ?? null;
}

export async function create(data: NewRepository) {
  const [row] = await db.insert(repositories).values(data).returning();
  return row;
}

export async function update(id: number, data: Partial<NewRepository>) {
  const [row] = await db
    .update(repositories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(repositories.id, id))
    .returning();
  return row ?? null;
}

export async function findBatchForScanning(limit: number) {
  return db
    .select()
    .from(repositories)
    .where(eq(repositories.isActive, true))
    .orderBy(asc(sql`${repositories.lastCheckedAt} NULLS FIRST`))
    .limit(limit);
}
