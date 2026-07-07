import { eq, and, gte, lte, count, avg, sql, desc, isNotNull } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  users,
  batches,
  batchEnrollments,
  courses,
  modules,
  lessons,
  lessonProgress,
  exams,
  examAttempts,
  liveClasses,
  attendance,
} from '../../../drizzle/schema.js';

// ── Date helpers ──────────────────────────────────────────────────────────────

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Overview stats ────────────────────────────────────────────────────────────

export async function getOverviewStats() {
  const [
    [totalStudents],
    [activeStudents],
    [totalBatches],
    [activeBatches],
    [totalCourses],
    [totalLessons],
    [totalExams],
    [attemptStats],
  ] = await Promise.all([
    db.select({ n: count() }).from(users).where(eq(users.role, 'student')),
    db.select({ n: count() }).from(users).where(and(eq(users.role, 'student'), eq(users.isActive, true))),
    db.select({ n: count() }).from(batches),
    db.select({ n: count() }).from(batches).where(eq(batches.status, 'active')),
    db.select({ n: count() }).from(courses),
    db.select({ n: count() }).from(lessons),
    db.select({ n: count() }).from(exams),
    db.select({
      total: count(),
      avgScore: avg(sql<number>`case when ${examAttempts.maxScore} > 0 then ${examAttempts.score} / ${examAttempts.maxScore} * 100 else null end`),
    }).from(examAttempts).where(isNotNull(examAttempts.submittedAt)),
  ]);

  return {
    students: { total: totalStudents!.n, active: activeStudents!.n },
    batches: { total: totalBatches!.n, active: activeBatches!.n },
    content: { courses: totalCourses!.n, lessons: totalLessons!.n },
    exams: {
      total: totalExams!.n,
      attempts: attemptStats!.total,
      avgScore: attemptStats!.avgScore ? Number(Number(attemptStats.avgScore).toFixed(1)) : null,
    },
  };
}

// ── Enrollment trend — last 12 months ─────────────────────────────────────────

export async function getEnrollmentTrend() {
  const since = monthsAgo(11);

  const rows = await db
    .select({
      month: sql<string>`to_char(${batchEnrollments.enrolledAt}, 'YYYY-MM')`,
      count: count(),
    })
    .from(batchEnrollments)
    .where(gte(batchEnrollments.enrolledAt, since))
    .groupBy(sql`to_char(${batchEnrollments.enrolledAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${batchEnrollments.enrolledAt}, 'YYYY-MM')`);

  return rows;
}

// ── Exam performance per batch ─────────────────────────────────────────────────

export async function getExamPerformanceByBatch(batchId?: string) {
  const conditions = [isNotNull(examAttempts.submittedAt)];
  if (batchId) {
    // Filter via exam → batch join (exams have batchIds in their schema as array)
    // Approximate: filter attempts whose exam is in the given batch's exams
    conditions.push(
      sql`${examAttempts.examId} in (select id from exams where ${batchId} = any(batch_ids))`,
    );
  }

  const rows = await db
    .select({
      examId: examAttempts.examId,
      examTitle: exams.title,
      attempts: count(),
      avgPct: avg(
        sql<number>`case when ${examAttempts.maxScore} > 0 then ${examAttempts.score} / ${examAttempts.maxScore} * 100 else null end`,
      ),
      maxPct: sql<number>`max(case when ${examAttempts.maxScore} > 0 then ${examAttempts.score} / ${examAttempts.maxScore} * 100 else null end)`,
      minPct: sql<number>`min(case when ${examAttempts.maxScore} > 0 then ${examAttempts.score} / ${examAttempts.maxScore} * 100 else null end)`,
    })
    .from(examAttempts)
    .innerJoin(exams, eq(examAttempts.examId, exams.id))
    .where(and(...conditions))
    .groupBy(examAttempts.examId, exams.title)
    .orderBy(desc(count()));

  return rows.map((r) => ({
    examId: r.examId,
    examTitle: r.examTitle,
    attempts: r.attempts,
    avgScore: r.avgPct ? Number(Number(r.avgPct).toFixed(1)) : null,
    maxScore: r.maxPct ? Number(Number(r.maxPct).toFixed(1)) : null,
    minScore: r.minPct ? Number(Number(r.minPct).toFixed(1)) : null,
  }));
}

// ── Lesson completion rates by course ─────────────────────────────────────────

export async function getLessonCompletionByCourse() {
  const rows = await db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      totalLessons: count(lessons.id),
      completions: sql<number>`count(distinct case when ${lessonProgress.isCompleted} then ${lessonProgress.userId} || ':' || ${lessonProgress.lessonId} end)`,
      uniqueStudents: sql<number>`count(distinct ${lessonProgress.userId})`,
    })
    .from(courses)
    .leftJoin(modules, eq(modules.courseId, courses.id))
    .leftJoin(lessons, eq(lessons.moduleId, modules.id))
    .leftJoin(lessonProgress, eq(lessonProgress.lessonId, lessons.id))
    .groupBy(courses.id, courses.title)
    .orderBy(desc(courses.createdAt));

  return rows.map((r) => ({
    courseId: r.courseId,
    courseTitle: r.courseTitle,
    totalLessons: r.totalLessons,
    completedLessonUserPairs: Number(r.completions),
    uniqueStudents: Number(r.uniqueStudents),
  }));
}

// ── Top performing students (by exam avg) ─────────────────────────────────────

export async function getTopStudents(limit = 20) {
  const rows = await db
    .select({
      studentId: examAttempts.studentId,
      name: users.name,
      phone: users.phone,
      attempts: count(),
      avgScore: avg(
        sql<number>`case when ${examAttempts.maxScore} > 0 then ${examAttempts.score} / ${examAttempts.maxScore} * 100 else null end`,
      ),
    })
    .from(examAttempts)
    .innerJoin(users, eq(examAttempts.studentId, users.id))
    .where(isNotNull(examAttempts.submittedAt))
    .groupBy(examAttempts.studentId, users.name, users.phone)
    .orderBy(
      desc(avg(sql<number>`case when ${examAttempts.maxScore} > 0 then ${examAttempts.score} / ${examAttempts.maxScore} * 100 else null end`)),
    )
    .limit(limit);

  return rows.map((r) => ({
    studentId: r.studentId,
    name: r.name,
    phone: r.phone,
    attempts: r.attempts,
    avgScore: r.avgScore ? Number(Number(r.avgScore).toFixed(1)) : null,
  }));
}

// ── Live class attendance rates ────────────────────────────────────────────────

export async function getLiveClassStats(batchId?: string) {
  const conditions = batchId ? [eq(liveClasses.batchId, batchId)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      classId: liveClasses.id,
      topic: liveClasses.title,
      startTime: liveClasses.startTime,
      batchId: liveClasses.batchId,
      attendees: count(attendance.id),
    })
    .from(liveClasses)
    .leftJoin(attendance, eq(attendance.liveClassId, liveClasses.id))
    .where(where)
    .groupBy(liveClasses.id, liveClasses.title, liveClasses.startTime, liveClasses.batchId)
    .orderBy(desc(liveClasses.startTime))
    .limit(50);

  return rows;
}

// ═════════════════════════════════════════════════════════════════════════════
// CSV EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))];
  return lines.join('\n');
}

export async function exportStudentsCsv(batchId?: string): Promise<string> {
  const conditions = [eq(users.role, 'student')];

  let query = db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(users.createdAt);

  const rows = await (batchId
    ? db
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .innerJoin(
          batchEnrollments,
          and(eq(batchEnrollments.userId, users.id), eq(batchEnrollments.batchId, batchId)),
        )
        .where(eq(users.role, 'student'))
        .orderBy(users.createdAt)
    : query);

  return toCsv(
    ['ID', 'Name', 'Phone', 'Active', 'Joined'],
    rows.map((r) => [r.id, r.name, r.phone, r.isActive ? 'Yes' : 'No', r.createdAt.toISOString().slice(0, 10)]),
  );
}

export async function exportExamResultsCsv(examId?: string): Promise<string> {
  const conditions = [isNotNull(examAttempts.submittedAt)];
  if (examId) conditions.push(eq(examAttempts.examId, examId));

  const rows = await db
    .select({
      attemptId: examAttempts.id,
      studentName: users.name,
      studentPhone: users.phone,
      examTitle: exams.title,
      score: examAttempts.score,
      maxScore: examAttempts.maxScore,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
      tabSwitches: examAttempts.tabSwitchCount,
      autoSubmitted: examAttempts.isAutoSubmitted,
    })
    .from(examAttempts)
    .innerJoin(users, eq(examAttempts.studentId, users.id))
    .innerJoin(exams, eq(examAttempts.examId, exams.id))
    .where(and(...conditions))
    .orderBy(desc(examAttempts.submittedAt));

  return toCsv(
    ['Attempt ID', 'Student', 'Phone', 'Exam', 'Score', 'Max Score', '% Score', 'Started', 'Submitted', 'Tab Switches', 'Auto Submitted'],
    rows.map((r) => {
      const pct = r.score != null && r.maxScore != null && r.maxScore > 0
        ? ((r.score / r.maxScore) * 100).toFixed(1)
        : '';
      return [
        r.attemptId,
        r.studentName,
        r.studentPhone,
        r.examTitle,
        r.score ?? '',
        r.maxScore ?? '',
        pct,
        r.startedAt.toISOString(),
        r.submittedAt?.toISOString() ?? '',
        r.tabSwitches,
        r.autoSubmitted ? 'Yes' : 'No',
      ];
    }),
  );
}

export async function exportAttendanceCsv(batchId?: string): Promise<string> {
  const conditions = batchId ? [eq(attendance.batchId, batchId)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      studentName: users.name,
      studentPhone: users.phone,
      date: attendance.date,
      type: attendance.type,
      status: attendance.status,
      markedAt: attendance.markedAt,
    })
    .from(attendance)
    .innerJoin(users, eq(attendance.studentId, users.id))
    .where(where)
    .orderBy(desc(attendance.markedAt));

  return toCsv(
    ['Student', 'Phone', 'Date', 'Type', 'Status', 'Marked At'],
    rows.map((r) => [r.studentName, r.studentPhone, r.date, r.type, r.status, r.markedAt.toISOString()]),
  );
}
