import { eq, count, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { batchInstructors, batches, doubts, users } from '../../../drizzle/schema.js';

export async function getMentorWorkload() {
  const staff = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(sql`${users.role} IN ('instructor', 'staff')`);

  const batchLoad = await db
    .select({
      instructorId: batchInstructors.instructorId,
      batchCount: count(batchInstructors.batchId),
      batchNames: sql<string[]>`array_agg(${batches.name})`,
    })
    .from(batchInstructors)
    .innerJoin(batches, eq(batches.id, batchInstructors.batchId))
    .groupBy(batchInstructors.instructorId);

  const doubtLoad = await db
    .select({
      assignedTo: doubts.assignedTo,
      answeredCount: count(doubts.id),
      avgResponseMins: sql<number>`coalesce(avg(extract(epoch from (${doubts.resolvedAt} - coalesce(${doubts.assignedAt}, ${doubts.createdAt}))) / 60), 0)`,
    })
    .from(doubts)
    .where(sql`${doubts.status} = 'resolved' AND ${doubts.assignedTo} IS NOT NULL`)
    .groupBy(doubts.assignedTo);

  const batchMap = new Map(batchLoad.map((b) => [b.instructorId, b]));
  const doubtMap = new Map(doubtLoad.map((d) => [d.assignedTo, d]));

  return staff
    .map((s) => {
      const b = batchMap.get(s.id);
      const d = doubtMap.get(s.id);
      return {
        id: s.id,
        name: s.name,
        batchCount: b?.batchCount ?? 0,
        batchNames: b?.batchNames ?? [],
        doubtsAnswered: d?.answeredCount ?? 0,
        avgResponseMins: d ? Math.round(d.avgResponseMins) : null,
      };
    })
    .sort((a, b) => b.doubtsAnswered - a.doubtsAnswered || b.batchCount - a.batchCount);
}
