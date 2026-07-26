import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { branches } from '../../../drizzle/schema.js';
import type { CreateBranchInput, UpdateBranchInput } from './branches.schema.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

export async function listBranches(page: number, limit: number, search?: string) {
  const where = search ? ilike(branches.name, `%${search}%`) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(branches).where(where);
  const items = await db
    .select()
    .from(branches)
    .where(where)
    .orderBy(desc(branches.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
  return { items, total };
}

export async function getBranchById(id: string) {
  const [branch] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
  if (!branch) throw err('Branch not found', 404, 'BRANCH_NOT_FOUND');
  return branch;
}

export async function createBranch(input: CreateBranchInput) {
  const [existing] = await db.select({ id: branches.id }).from(branches).where(eq(branches.code, input.code)).limit(1);
  if (existing) throw err('A branch with this code already exists', 409, 'BRANCH_CODE_EXISTS');
  const [branch] = await db.insert(branches).values(input).returning();
  return branch;
}

export async function updateBranch(id: string, input: UpdateBranchInput) {
  const [branch] = await db
    .update(branches)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(branches.id, id))
    .returning();
  if (!branch) throw err('Branch not found', 404, 'BRANCH_NOT_FOUND');
  return branch;
}
