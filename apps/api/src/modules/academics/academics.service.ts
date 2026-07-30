import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { batches, doubts, examAttempts, exams } from '../../../drizzle/schema.js';

export async function getCoordinatorDashboard() {
  const [
    [{ value: openDoubts }],
    [{ value: unassignedDoubts }],
    [avgResolution],
    [{ value: activeBatches }],
    [{ value: examsPendingPublish }],
    [{ value: topicQuizCount }],
    [topicQuizPerf],
  ] = await Promise.all([
    db.select({ value: count() }).from(doubts).where(inArray(doubts.status, ['open', 'escalated'])),
    db.select({ value: count() }).from(doubts).where(and(inArray(doubts.status, ['open', 'escalated']), isNull(doubts.assignedTo))),
    db
      .select({ mins: sql<number>`coalesce(avg(extract(epoch from (${doubts.resolvedAt} - ${doubts.createdAt})) / 60), 0)` })
      .from(doubts)
      .where(eq(doubts.status, 'resolved')),
    db.select({ value: count() }).from(batches).where(eq(batches.status, 'active')),
    db.select({ value: count() }).from(exams).where(eq(exams.isPublished, false)),
    db.select({ value: count() }).from(exams).where(eq(exams.type, 'topic_quiz')),
    db
      .select({
        attempts: count(),
        passRate: sql<number>`coalesce(avg(case when (${examAttempts.score} / nullif(${examAttempts.maxScore}, 0)) * 100 >= ${exams.passPercent} then 100.0 else 0 end), 0)`,
      })
      .from(examAttempts)
      .innerJoin(exams, eq(exams.id, examAttempts.examId))
      .where(and(eq(exams.type, 'topic_quiz'), sql`${examAttempts.submittedAt} IS NOT NULL`)),
  ]);

  return {
    openDoubts,
    unassignedDoubts,
    avgResolutionMins: Math.round(avgResolution?.mins ?? 0),
    activeBatches,
    examsPendingPublish,
    topicQuizCount,
    topicQuizAttempts: topicQuizPerf?.attempts ?? 0,
    topicQuizPassRate: Math.round(topicQuizPerf?.passRate ?? 0),
  };
}
