import { and, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import { examAttempts, exams, lessonProgress, streaks } from '../../../drizzle/schema.js';
import { aiCoachPlan, AiUnavailableError, type AiCoachPlan } from '../../lib/ai-client.js';
import { logger } from '../../lib/logger.js';

const CACHE_TTL_SECONDS = 24 * 3600; // one plan per day per student
// The starter plan is a stand-in, not an answer: cache it just long enough to
// spare the AI service a request per screen visit, so personalised plans come
// back within the half hour once the AI does.
const STARTER_PLAN_TTL_SECONDS = 30 * 60;

/**
 * What Coach shows when the AI cannot produce a plan — provider outage,
 * expired key, timeout. It used to be an error screen ("Your coach is offline
 * right now"), which is what a student or a store reviewer met for weeks when
 * the Groq key expired in October 2026. A sensible generic week is better than
 * nothing, and the motivation line says plainly that it is not personalised.
 */
function starterPlan(): AiCoachPlan {
  return {
    strengths: [],
    weaknesses: [],
    at_risk: false,
    motivation:
      'Here is a starter week to build your routine. Your personalised plan will appear here as you complete classes and tests.',
    weekly_plan: [
      {
        day: 'Monday',
        focus: 'Build your routine',
        tasks: ['Fix a daily study time and keep to it', "Read today's current affairs and answer its quiz", 'Watch one class from your course'],
      },
      {
        day: 'Tuesday',
        focus: 'Polity basics',
        tasks: ['Read one NCERT Polity chapter', 'Note five key articles of the Constitution', "Read today's current affairs"],
      },
      {
        day: 'Wednesday',
        focus: 'History and culture',
        tasks: ['Read one NCERT History chapter', 'Write a one-page summary in your own words', "Read today's current affairs"],
      },
      {
        day: 'Thursday',
        focus: 'Geography and environment',
        tasks: ['Read one NCERT Geography chapter', 'Find ten places from this week\'s news on a map', "Read today's current affairs"],
      },
      {
        day: 'Friday',
        focus: 'Economy',
        tasks: ['Read one NCERT Economy chapter', 'Explain five economic terms from this week\'s news', "Read today's current affairs"],
      },
      {
        day: 'Saturday',
        focus: 'Practice',
        tasks: ['Take a test from the Exams tab', 'Write one 150-word answer on a topic from the week', 'Ask a doubt about anything that was unclear'],
      },
      {
        day: 'Sunday',
        focus: 'Revise and plan',
        tasks: ["Revise the week's notes", 'Re-read the current affairs you found hardest', 'Plan next week\'s study slots'],
      },
    ],
  };
}
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
  let plan: AiCoachPlan;
  let ttl = CACHE_TTL_SECONDS;
  try {
    plan = await aiCoachPlan({
      ...stats,
      target_exam: 'generic',
      language: opts.language ?? 'en',
    });
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    logger.warn({ err: err.message }, 'AI coach unavailable — serving the starter plan');
    plan = starterPlan();
    ttl = STARTER_PLAN_TTL_SECONDS;
  }

  const payload = { plan, generatedAt: new Date().toISOString() };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', ttl);

  return { ...payload, cached: false };
}
