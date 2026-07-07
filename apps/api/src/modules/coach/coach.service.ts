import { and, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import { examAttempts, exams, lessonProgress, streaks } from '../../../drizzle/schema.js';
import { aiCoachPlan, type AiCoachPlan } from '../../lib/ai-client.js';

const CACHE_TTL_SECONDS = 24 * 3600; // one plan per day per student
const keyPrefix = () => process.env['REDIS_KEY_PREFIX'] ?? 'inspiro:';

interface SubjectStats {
  subject: string;
  attempts: number;
  avg_percent: number;
  last_percent: number;
}

async function gatherStats(studentId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [attempts, [streak], progress] = await Promise.all([
    db
      .select({
        subject: exams.subject,
        score: examAttempts.score,
        maxScore: examAttempts.maxScore,
        submittedAt: examAttempts.submittedAt,
      })
      .from(examAttempts)
      .innerJoin(exams, eq(examAttempts.examId, exams.id))
      .where(and(eq(examAttempts.studentId, studentId), isNotNull(examAttempts.submittedAt))),
    db.select().from(streaks).where(eq(streaks.userId, studentId)).limit(1),
    db
      .select({
        watchedSeconds: lessonProgress.watchedSeconds,
        isCompleted: lessonProgress.isCompleted,
      })
      .from(lessonProgress)
      .where(
        and(eq(lessonProgress.userId, studentId), gte(lessonProgress.lastWatchedAt, thirtyDaysAgo)),
      ),
  ]);

  // Aggregate per subject in JS — a student's attempt count is small
  const bySubject = new Map<string, { percents: number[]; latest: { at: Date; pct: number } }>();
  for (const a of attempts) {
    if (a.score == null || a.maxScore == null || a.maxScore === 0 || !a.submittedAt) continue;
    const pct = (a.score / a.maxScore) * 100;
    const entry = bySubject.get(a.subject) ?? { percents: [], latest: { at: new Date(0), pct } };
    entry.percents.push(pct);
    if (a.submittedAt > entry.latest.at) entry.latest = { at: a.submittedAt, pct };
    bySubject.set(a.subject, entry);
  }

  const subjects: SubjectStats[] = [...bySubject.entries()].map(([subject, s]) => ({
    subject,
    attempts: s.percents.length,
    avg_percent: Math.round(s.percents.reduce((a, b) => a + b, 0) / s.percents.length),
    last_percent: Math.round(s.latest.pct),
  }));

  return {
    subjects: subjects.slice(0, 20),
    streak_days: streak?.currentStreak ?? 0,
    study_minutes_last_30d: Math.round(
      progress.reduce((sum, p) => sum + p.watchedSeconds, 0) / 60,
    ),
    lessons_completed_last_30d: progress.filter((p) => p.isCompleted).length,
  };
}

export async function getMyPlan(
  studentId: string,
  opts: { language?: 'en' | 'ml'; refresh?: boolean } = {},
): Promise<{ plan: AiCoachPlan; generatedAt: string; cached: boolean }> {
  const cacheKey = `${keyPrefix()}coach:${studentId}:${opts.language ?? 'en'}`;

  if (!opts.refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { plan: AiCoachPlan; generatedAt: string };
      return { ...parsed, cached: true };
    }
  }

  const stats = await gatherStats(studentId);
  const plan = await aiCoachPlan({
    ...stats,
    target_exam: 'generic',
    language: opts.language ?? 'en',
  });

  const payload = { plan, generatedAt: new Date().toISOString() };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS);

  return { ...payload, cached: false };
}
