import { eq, and, count, inArray, lt, gt, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import {
  exams,
  questions,
  examAttempts,
  batchEnrollments,
  leaderboard,
} from '../../../drizzle/schema.js';
import { logger } from '../../lib/logger.js';
import type {
  CreateExamInput,
  UpdateExamInput,
  CreateQuestionInput,
  SubmitExamInput,
  ListExamsInput,
  ListQuestionsInput,
} from './exams.schema.js';

// ── Redis keys ────────────────────────────────────────────────────────────────
const activeAttemptKey = (attemptId: string) => `exam:active:${attemptId}`;
const attemptTimerKey = (attemptId: string) => `exam:timer:${attemptId}`;

function err(msg: string, status: number, code: string) {
  return Object.assign(new Error(msg), { statusCode: status, code });
}

// ── Verify student is enrolled in a batch that includes this exam ──────────────
async function assertExamAccess(userId: string, examId: string): Promise<void> {
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam || !exam.isPublished) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');

  // Practice exams are open to all enrolled students (no batch restriction)
  if (exam.type === 'practice') return;

  // Batch-restricted exam: student must be in one of the assigned batches
  if (exam.batchIds && exam.batchIds.length > 0) {
    const [enrolled] = await db
      .select({ id: batchEnrollments.id })
      .from(batchEnrollments)
      .where(
        and(
          eq(batchEnrollments.userId, userId),
          eq(batchEnrollments.status, 'active'),
          inArray(batchEnrollments.batchId, exam.batchIds),
        ),
      )
      .limit(1);

    if (!enrolled) throw err('You are not enrolled in a batch for this exam', 403, 'NOT_ENROLLED');
  }
}

// ── Check exam schedule window ────────────────────────────────────────────────
function assertScheduleWindow(exam: typeof exams.$inferSelect): void {
  const now = new Date();
  if (exam.scheduleStart && now < new Date(exam.scheduleStart)) {
    throw err('Exam has not started yet', 403, 'EXAM_NOT_STARTED');
  }
  if (exam.scheduleEnd && now > new Date(exam.scheduleEnd)) {
    throw err('Exam window has closed', 403, 'EXAM_WINDOW_CLOSED');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN
// ═════════════════════════════════════════════════════════════════════════════

export async function getExamById(examId: string) {
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');
  return exam;
}

export async function listAllExams(input: ListExamsInput) {
  const { page, limit, subject, type } = input;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (subject) conditions.push(eq(exams.subject, subject));
  if (type) conditions.push(eq(exams.type, type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(exams).where(where);
  const items = await db.select().from(exams).where(where).limit(limit).offset(offset);
  return { items, total };
}

export async function createExam(data: CreateExamInput, createdBy: string) {
  const [exam] = await db
    .insert(exams)
    .values({
      ...data,
      scheduleStart: data.scheduleStart ? new Date(data.scheduleStart) : null,
      scheduleEnd: data.scheduleEnd ? new Date(data.scheduleEnd) : null,
      createdBy,
    })
    .returning();
  return exam!;
}

export async function updateExam(examId: string, data: UpdateExamInput) {
  const [updated] = await db
    .update(exams)
    .set({
      ...data,
      scheduleStart: data.scheduleStart ? new Date(data.scheduleStart) : undefined,
      scheduleEnd: data.scheduleEnd ? new Date(data.scheduleEnd) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(exams.id, examId))
    .returning();
  if (!updated) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');
  return updated;
}

export async function publishExam(examId: string) {
  // Require at least 1 question before publishing
  const [{ qCount }] = await db
    .select({ qCount: count() })
    .from(questions)
    .where(eq(questions.examId, examId));

  if (qCount === 0) throw err('Cannot publish an exam with no questions', 400, 'NO_QUESTIONS');

  const [updated] = await db
    .update(exams)
    .set({ isPublished: true, updatedAt: new Date() })
    .where(eq(exams.id, examId))
    .returning();
  if (!updated) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');
  return updated;
}

export async function deleteExam(examId: string) {
  const result = await db.delete(exams).where(eq(exams.id, examId)).returning();
  if (result.length === 0) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');
  return { deleted: true };
}

// ── Question bank ─────────────────────────────────────────────────────────────
export async function addQuestion(examId: string, data: CreateQuestionInput) {
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');

  const [q] = await db.insert(questions).values({ ...data, examId }).returning();
  return q!;
}

export async function bulkImportQuestions(examId: string, qs: CreateQuestionInput[]) {
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');

  const rows = qs.map((q) => ({ ...q, examId }));
  const inserted = await db.insert(questions).values(rows).returning();
  return { imported: inserted.length };
}

export async function updateQuestion(questionId: string, data: Partial<CreateQuestionInput>) {
  const [updated] = await db
    .update(questions)
    .set(data)
    .where(eq(questions.id, questionId))
    .returning();
  if (!updated) throw err('Question not found', 404, 'QUESTION_NOT_FOUND');
  return updated;
}

export async function deleteQuestion(questionId: string) {
  const result = await db.delete(questions).where(eq(questions.id, questionId)).returning();
  if (result.length === 0) throw err('Question not found', 404, 'QUESTION_NOT_FOUND');
  return { deleted: true };
}

export async function listQuestions(examId: string, input: ListQuestionsInput) {
  const { page, limit, subject, difficulty, chapter } = input;
  const offset = (page - 1) * limit;

  const conditions = [eq(questions.examId, examId)];
  if (subject) conditions.push(eq(questions.subject, subject));
  if (difficulty) conditions.push(eq(questions.difficulty, difficulty));
  if (chapter) conditions.push(eq(questions.chapter, chapter));

  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(questions).where(where);
  const items = await db.select().from(questions).where(where).limit(limit).offset(offset);
  return { items, total };
}

export async function getExamAnalytics(examId: string) {
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');

  const attempts = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.examId, examId), sql`${examAttempts.submittedAt} IS NOT NULL`));

  if (attempts.length === 0) {
    return { examId, totalAttempts: 0, submitted: 0, avgScore: null, passRate: null, topScore: null };
  }

  const scores = attempts.map((a) => a.score ?? 0);
  const maxScore = exam.durationMins; // placeholder — real max = question count × 1
  const passThreshold = (exam.passPercent / 100) * (attempts[0]?.maxScore ?? 100);
  const passed = scores.filter((s) => s >= passThreshold).length;

  return {
    examId,
    totalAttempts: attempts.length,
    submitted: attempts.filter((a) => a.submittedAt).length,
    avgScore: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
    topScore: Math.max(...scores),
    passRate: Number(((passed / attempts.length) * 100).toFixed(1)),
    autoSubmitted: attempts.filter((a) => a.isAutoSubmitted).length,
    avgTabSwitches: Number(
      (attempts.reduce((a, b) => a + b.tabSwitchCount, 0) / attempts.length).toFixed(1),
    ),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// STUDENT — attempt lifecycle
// ═════════════════════════════════════════════════════════════════════════════

export async function listAvailableExams(userId: string, input: ListExamsInput) {
  const { page, limit, subject, type } = input;
  const offset = (page - 1) * limit;

  // Get student's active batch IDs
  const enrollments = await db
    .select({ batchId: batchEnrollments.batchId })
    .from(batchEnrollments)
    .where(and(eq(batchEnrollments.userId, userId), eq(batchEnrollments.status, 'active')));

  const batchIds = enrollments.map((e) => e.batchId);

  const now = new Date();

  // Exams available to student:
  // 1. Practice exams (open to all)
  // 2. Exams whose batchIds overlap with student's batches
  // 3. Within schedule window
  const conditions = [
    eq(exams.isPublished, true),
    sql`(${exams.scheduleEnd} IS NULL OR ${exams.scheduleEnd} > ${now})`,
    batchIds.length > 0
      ? sql`(${exams.type} = 'practice' OR ${exams.batchIds} && ARRAY[${sql.join(batchIds.map(id => sql`${id}::uuid`), sql`, `)}])`
      : sql`${exams.type} = 'practice'`,
  ];

  if (subject) conditions.push(eq(exams.subject, subject));
  if (type) conditions.push(eq(exams.type, type));

  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(exams).where(where);
  const items = await db.select().from(exams).where(where).limit(limit).offset(offset);

  // Attach attempt status for this student
  const examIds = items.map((e) => e.id);
  const attemptCounts = examIds.length > 0
    ? await db
        .select({ examId: examAttempts.examId, cnt: count() })
        .from(examAttempts)
        .where(and(eq(examAttempts.studentId, userId), inArray(examAttempts.examId, examIds)))
        .groupBy(examAttempts.examId)
    : [];

  const attemptsMap = Object.fromEntries(attemptCounts.map((r) => [r.examId, r.cnt]));

  return {
    items: items.map((exam) => ({
      ...exam,
      attemptsMade: attemptsMap[exam.id] ?? 0,
      canAttempt:
        exam.maxAttempts === null || (attemptsMap[exam.id] ?? 0) < (exam.maxAttempts ?? Infinity),
    })),
    total,
  };
}

export async function startExam(examId: string, studentId: string) {
  await assertExamAccess(studentId, examId);

  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');

  assertScheduleWindow(exam);

  // Enforce maxAttempts
  const [{ used }] = await db
    .select({ used: count() })
    .from(examAttempts)
    .where(and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, studentId)));

  if (exam.maxAttempts !== null && used >= exam.maxAttempts) {
    throw err(`Attempt limit reached (${exam.maxAttempts})`, 403, 'ATTEMPT_LIMIT_REACHED');
  }

  // Check no active attempt already in progress
  const [existing] = await db
    .select()
    .from(examAttempts)
    .where(
      and(
        eq(examAttempts.examId, examId),
        eq(examAttempts.studentId, studentId),
        sql`${examAttempts.submittedAt} IS NULL`,
      ),
    )
    .limit(1);

  if (existing) {
    // Resume existing attempt
    return { attempt: existing, questions: await getExamQuestions(examId), resumed: true };
  }

  // Create new attempt
  const [attempt] = await db
    .insert(examAttempts)
    .values({ examId, studentId, maxScore: 0 /* updated on submit */ })
    .returning();

  // Store active state in Redis with TTL = exam duration + 5 min grace
  const ttl = exam.durationMins * 60 + 300;
  await redis.set(
    activeAttemptKey(attempt!.id),
    JSON.stringify({ examId, studentId, startedAt: attempt!.startedAt.toISOString() }),
    'EX',
    ttl,
  );

  const questionList = await getExamQuestions(examId);

  return { attempt: attempt!, questions: questionList, resumed: false };
}

// Return questions without revealing correctIndex or explanation
async function getExamQuestions(examId: string) {
  const qs = await db
    .select({
      id: questions.id,
      subject: questions.subject,
      chapter: questions.chapter,
      difficulty: questions.difficulty,
      body: questions.body,
      options: questions.options,
      imageUrl: questions.imageUrl,
      tags: questions.tags,
    })
    .from(questions)
    .where(eq(questions.examId, examId));

  return qs;
}

export async function submitExam(
  examId: string,
  attemptId: string,
  studentId: string,
  input: SubmitExamInput,
) {
  // Load attempt
  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(
      and(
        eq(examAttempts.id, attemptId),
        eq(examAttempts.examId, examId),
        eq(examAttempts.studentId, studentId),
      ),
    )
    .limit(1);

  if (!attempt) throw err('Attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  if (attempt.submittedAt) throw err('Exam already submitted', 409, 'ALREADY_SUBMITTED');

  // Load exam + questions with answers
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw err('Exam not found', 404, 'EXAM_NOT_FOUND');

  const questionList = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, examId));

  // ── Score calculation ──────────────────────────────────────────────────────
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  for (const q of questionList) {
    const chosen = input.answers[q.id];
    if (chosen === undefined || chosen === null) {
      skipped++;
    } else if (chosen === q.correctIndex) {
      correct++;
    } else {
      wrong++;
    }
  }

  const maxScore = questionList.length;
  const rawScore = correct - wrong * exam.negMarks;
  const score = Math.max(0, rawScore); // floor at 0

  // ── Persist result ─────────────────────────────────────────────────────────
  const [submitted] = await db
    .update(examAttempts)
    .set({
      score,
      maxScore,
      answersJson: input.answers,
      submittedAt: new Date(),
      isAutoSubmitted: input.isAutoSubmitted,
      tabSwitchCount: input.tabSwitchCount,
    })
    .where(eq(examAttempts.id, attemptId))
    .returning();

  // Clean up Redis active state
  await redis.del(activeAttemptKey(attemptId));

  // ── Compute rank (async — don't block response) ────────────────────────────
  setImmediate(() => {
    computeRanks(examId).catch((e) =>
      logger.error({ err: e, examId }, 'Rank computation failed'),
    );
  });

  return {
    attemptId,
    score,
    maxScore,
    correct,
    wrong,
    skipped,
    percentage: Number(((score / maxScore) * 100).toFixed(2)),
    passed: (score / maxScore) * 100 >= exam.passPercent,
  };
}

export async function getExamResult(examId: string, studentId: string) {
  const [attempt] = await db
    .select()
    .from(examAttempts)
    .where(
      and(
        eq(examAttempts.examId, examId),
        eq(examAttempts.studentId, studentId),
        sql`${examAttempts.submittedAt} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${examAttempts.submittedAt} DESC`)
    .limit(1);

  if (!attempt) throw err('No completed attempt found for this exam', 404, 'NO_ATTEMPT');

  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);

  // Load questions WITH answers for result review
  const questionList = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, examId));

  // Annotate each question with student's answer
  const answers = (attempt.answersJson ?? {}) as Record<string, number>;
  const breakdown = questionList.map((q) => ({
    id: q.id,
    body: q.body,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    imageUrl: q.imageUrl,
    subject: q.subject,
    chapter: q.chapter,
    difficulty: q.difficulty,
    studentAnswer: answers[q.id] ?? null,
    isCorrect: answers[q.id] === q.correctIndex,
    isSkipped: answers[q.id] === undefined,
  }));

  // Subject-wise accuracy
  const subjectMap: Record<string, { correct: number; total: number }> = {};
  for (const q of breakdown) {
    if (!subjectMap[q.subject]) subjectMap[q.subject] = { correct: 0, total: 0 };
    subjectMap[q.subject]!.total++;
    if (q.isCorrect) subjectMap[q.subject]!.correct++;
  }

  return {
    attempt: {
      id: attempt.id,
      score: attempt.score,
      maxScore: attempt.maxScore,
      rank: attempt.rank,
      submittedAt: attempt.submittedAt,
      isAutoSubmitted: attempt.isAutoSubmitted,
      tabSwitchCount: attempt.tabSwitchCount,
      percentage: attempt.score !== null && attempt.maxScore
        ? Number(((attempt.score / attempt.maxScore) * 100).toFixed(2))
        : null,
      passed: attempt.score !== null && attempt.maxScore
        ? (attempt.score / attempt.maxScore) * 100 >= (exam?.passPercent ?? 40)
        : null,
    },
    subjectBreakdown: Object.entries(subjectMap).map(([subject, { correct, total }]) => ({
      subject,
      correct,
      total,
      accuracy: Number(((correct / total) * 100).toFixed(1)),
    })),
    questions: breakdown,
  };
}

export async function getMyAttempts(studentId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const [{ total }] = await db
    .select({ total: count() })
    .from(examAttempts)
    .where(eq(examAttempts.studentId, studentId));

  const items = await db
    .select({ attempt: examAttempts, exam: { id: exams.id, title: exams.title, subject: exams.subject, type: exams.type } })
    .from(examAttempts)
    .innerJoin(exams, eq(examAttempts.examId, exams.id))
    .where(eq(examAttempts.studentId, studentId))
    .orderBy(sql`${examAttempts.startedAt} DESC`)
    .limit(limit)
    .offset(offset);

  return { items, total };
}

export async function flagTabSwitch(attemptId: string, studentId: string, count: number) {
  const [updated] = await db
    .update(examAttempts)
    .set({ tabSwitchCount: count })
    .where(
      and(
        eq(examAttempts.id, attemptId),
        eq(examAttempts.studentId, studentId),
        sql`${examAttempts.submittedAt} IS NULL`,
      ),
    )
    .returning();

  if (!updated) throw err('Active attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  return { tabSwitchCount: count };
}

// ── Rank computation ──────────────────────────────────────────────────────────
async function computeRanks(examId: string): Promise<void> {
  const attempts = await db
    .select({ id: examAttempts.id, score: examAttempts.score })
    .from(examAttempts)
    .where(and(eq(examAttempts.examId, examId), sql`${examAttempts.submittedAt} IS NOT NULL`))
    .orderBy(sql`${examAttempts.score} DESC NULLS LAST`);

  await db.transaction(async (tx) => {
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i]!;
      await tx
        .update(examAttempts)
        .set({ rank: i + 1 })
        .where(eq(examAttempts.id, attempt.id));
    }
  });

  logger.info({ examId, ranked: attempts.length }, 'Ranks updated');
}
