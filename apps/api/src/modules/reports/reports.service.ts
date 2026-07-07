import { and, count, countDistinct, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import {
  attendance,
  batchEnrollments,
  batches,
  examAttempts,
  exams,
} from '../../../drizzle/schema.js';
import { aiMonthlyReport, type AiMonthlyReport } from '../../lib/ai-client.js';

export class BatchNotFoundError extends Error {}

const CACHE_TTL_SECONDS = 12 * 3600;
const keyPrefix = () => process.env['REDIS_KEY_PREFIX'] ?? 'inspiro:';

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y!, m! - 1, 1)),
    end: new Date(Date.UTC(y!, m!, 1)),
  };
}

export async function getMonthlyBatchReport(
  batchId: string,
  month: string, // YYYY-MM
  opts: { refresh?: boolean } = {},
): Promise<{ report: AiMonthlyReport; stats: Record<string, unknown>; generatedAt: string; cached: boolean }> {
  const cacheKey = `${keyPrefix()}report:${batchId}:${month}`;
  if (!opts.refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as {
        report: AiMonthlyReport; stats: Record<string, unknown>; generatedAt: string;
      };
      return { ...parsed, cached: true };
    }
  }

  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) throw new BatchNotFoundError('Batch not found');

  const { start, end } = monthRange(month);

  const [
    [enrolled],
    [attendanceStats],
    subjectRows,
    [activity],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(batchEnrollments)
      .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active'))),
    db
      .select({
        total: count(),
        present: count(sql`CASE WHEN ${attendance.status} = 'present' THEN 1 END`),
      })
      .from(attendance)
      .where(
        and(
          eq(attendance.batchId, batchId),
          gte(attendance.date, month + '-01'),
          lt(attendance.date, sql`(${month + '-01'}::date + interval '1 month')::date`),
        ),
      ),
    // Exam performance of this batch's students within the month
    db
      .select({
        subject: exams.subject,
        avgPercent: sql<number>`avg(${examAttempts.score} / nullif(${examAttempts.maxScore}, 0) * 100)`,
        attempts: count(),
      })
      .from(examAttempts)
      .innerJoin(exams, eq(examAttempts.examId, exams.id))
      .innerJoin(
        batchEnrollments,
        and(
          eq(batchEnrollments.userId, examAttempts.studentId),
          eq(batchEnrollments.batchId, batchId),
        ),
      )
      .where(and(gte(examAttempts.submittedAt, start), lt(examAttempts.submittedAt, end)))
      .groupBy(exams.subject),
    db
      .select({
        activeStudents: countDistinct(examAttempts.studentId),
        examsConducted: countDistinct(examAttempts.examId),
      })
      .from(examAttempts)
      .innerJoin(
        batchEnrollments,
        and(
          eq(batchEnrollments.userId, examAttempts.studentId),
          eq(batchEnrollments.batchId, batchId),
        ),
      )
      .where(and(gte(examAttempts.submittedAt, start), lt(examAttempts.submittedAt, end))),
  ]);

  const attendancePercent =
    attendanceStats && attendanceStats.total > 0
      ? (Number(attendanceStats.present) / Number(attendanceStats.total)) * 100
      : 0;

  const stats = {
    batchName: batch.name,
    month,
    enrolledStudents: enrolled?.value ?? 0,
    activeStudents: Number(activity?.activeStudents ?? 0),
    attendancePercent: Math.round(attendancePercent),
    examsConducted: Number(activity?.examsConducted ?? 0),
    subjectAverages: subjectRows.map((r) => ({
      subject: r.subject,
      avg_percent: Math.round(Number(r.avgPercent ?? 0)),
      attempts: Number(r.attempts),
    })),
  };

  const report = await aiMonthlyReport({
    batch_name: stats.batchName,
    month,
    enrolled_students: stats.enrolledStudents,
    active_students: stats.activeStudents,
    attendance_percent: stats.attendancePercent,
    subject_averages: stats.subjectAverages,
    exams_conducted: stats.examsConducted,
  });

  const payload = { report, stats, generatedAt: new Date().toISOString() };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS);

  return { ...payload, cached: false };
}
