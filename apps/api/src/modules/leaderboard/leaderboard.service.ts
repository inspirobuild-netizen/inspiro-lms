import { eq, and, desc, asc, count, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { leaderboard, users, batchEnrollments, streaks, examAttempts } from '../../../drizzle/schema.js';

type Period = 'weekly' | 'monthly' | 'all_time';

function err(msg: string, status: number, code: string) {
  return Object.assign(new Error(msg), { statusCode: status, code });
}

// ── Get leaderboard for a batch+period ────────────────────────────────────────
export async function getBatchLeaderboard(
  batchId: string,
  period: Period,
  page: number,
  limit: number,
  requestingUserId: string,
) {
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: count() })
    .from(leaderboard)
    .where(
      and(
        eq(leaderboard.batchId, batchId),
        eq(leaderboard.period, period),
      ),
    );

  const rows = await db
    .select({
      id: leaderboard.id,
      rank: leaderboard.rank,
      totalScore: leaderboard.totalScore,
      examScore: leaderboard.examScore,
      studyTimeScore: leaderboard.studyTimeScore,
      streakScore: leaderboard.streakScore,
      updatedAt: leaderboard.updatedAt,
      student: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(leaderboard)
    .innerJoin(users, eq(leaderboard.studentId, users.id))
    .where(
      and(
        eq(leaderboard.batchId, batchId),
        eq(leaderboard.period, period),
      ),
    )
    .orderBy(asc(leaderboard.rank))
    .limit(limit)
    .offset(offset);

  // Find requesting user's own rank
  const [myEntry] = await db
    .select({ rank: leaderboard.rank, totalScore: leaderboard.totalScore })
    .from(leaderboard)
    .where(
      and(
        eq(leaderboard.studentId, requestingUserId),
        eq(leaderboard.batchId, batchId),
        eq(leaderboard.period, period),
      ),
    )
    .limit(1);

  return {
    items: rows,
    total,
    myRank: myEntry?.rank ?? null,
    myScore: myEntry?.totalScore ?? null,
  };
}

// ── Get global leaderboard (all_time, across all batches) ─────────────────────
export async function getGlobalLeaderboard(page: number, limit: number, requestingUserId: string) {
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: count() })
    .from(leaderboard)
    .where(eq(leaderboard.period, 'all_time'));

  const rows = await db
    .select({
      rank: leaderboard.rank,
      totalScore: leaderboard.totalScore,
      examScore: leaderboard.examScore,
      streakScore: leaderboard.streakScore,
      student: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
    })
    .from(leaderboard)
    .innerJoin(users, eq(leaderboard.studentId, users.id))
    .where(eq(leaderboard.period, 'all_time'))
    .orderBy(asc(leaderboard.rank))
    .limit(limit)
    .offset(offset);

  const [myEntry] = await db
    .select({ rank: leaderboard.rank, totalScore: leaderboard.totalScore })
    .from(leaderboard)
    .where(
      and(
        eq(leaderboard.studentId, requestingUserId),
        eq(leaderboard.period, 'all_time'),
      ),
    )
    .orderBy(asc(leaderboard.rank))
    .limit(1);

  return {
    items: rows,
    total,
    myRank: myEntry?.rank ?? null,
    myScore: myEntry?.totalScore ?? null,
  };
}

// ── Recompute & upsert leaderboard scores for a batch ────────────────────────
// Called after exam submission. Weights: exam 60%, streak 25%, study-time 15%.
export async function recomputeLeaderboard(batchId: string, period: Period) {
  // Get active students in batch
  const enrolled = await db
    .select({ userId: batchEnrollments.userId })
    .from(batchEnrollments)
    .where(
      and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.status, 'active'),
      ),
    );

  if (enrolled.length === 0) return;

  const userIds = enrolled.map((e) => e.userId);

  // Date window for period
  const now = new Date();
  let since: Date | null = null;
  if (period === 'weekly') {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'monthly') {
    since = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Aggregate exam scores per student (score/maxScore as percentage)
  const examScores = await db
    .select({
      studentId: examAttempts.studentId,
      avgPct: sql<number>`avg(case when ${examAttempts.maxScore} > 0 then ${examAttempts.score} / ${examAttempts.maxScore} * 100 else 0 end)`,
    })
    .from(examAttempts)
    .where(
      sql`${examAttempts.studentId} = any(${userIds}) and ${examAttempts.submittedAt} is not null${since ? sql` and ${examAttempts.startedAt} >= ${since}` : sql``}`,
    )
    .groupBy(examAttempts.studentId);

  // Streak scores
  const streakRows = await db
    .select({ userId: streaks.userId, currentStreak: streaks.currentStreak, totalXp: streaks.totalXp })
    .from(streaks)
    .where(sql`${streaks.userId} = any(${userIds})`);

  const examMap = new Map(examScores.map((r) => [r.studentId, r.avgPct ?? 0]));
  const streakMap = new Map(streakRows.map((r) => [r.userId, r]));

  // Normalise within batch (0–100 per component)
  const maxExam = Math.max(...[...examMap.values(), 1]);
  const maxStreak = Math.max(...[...streakRows.map((r) => r.currentStreak), 1]);

  const scored = userIds.map((userId) => {
    const examScore = ((examMap.get(userId) ?? 0) / maxExam) * 100;
    const streakVal = streakMap.get(userId)?.currentStreak ?? 0;
    const streakScore = (streakVal / maxStreak) * 100;
    const studyTimeScore = 0; // populated later when lesson progress tracking is added
    const totalScore = examScore * 0.6 + streakScore * 0.25 + studyTimeScore * 0.15;

    return { userId, examScore, streakScore, studyTimeScore, totalScore };
  });

  // Sort to assign ranks
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Upsert
  for (let i = 0; i < scored.length; i++) {
    const s = scored[i]!;
    await db
      .insert(leaderboard)
      .values({
        studentId: s.userId,
        batchId,
        period,
        examScore: s.examScore,
        streakScore: s.streakScore,
        studyTimeScore: s.studyTimeScore,
        totalScore: s.totalScore,
        rank: i + 1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [leaderboard.studentId, leaderboard.batchId, leaderboard.period],
        set: {
          examScore: s.examScore,
          streakScore: s.streakScore,
          studyTimeScore: s.studyTimeScore,
          totalScore: s.totalScore,
          rank: i + 1,
          updatedAt: new Date(),
        },
      });
  }
}

// ── Get a user's streak info ──────────────────────────────────────────────────
export async function getUserStreak(userId: string) {
  const [streak] = await db
    .select()
    .from(streaks)
    .where(eq(streaks.userId, userId))
    .limit(1);
  return streak ?? { currentStreak: 0, longestStreak: 0, totalXp: 0, lastStudyDate: null };
}

// ── Update streak on study activity ──────────────────────────────────────────
export async function touchStreak(userId: string, xpGained: number) {
  const today = new Date().toISOString().slice(0, 10);

  const [existing] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);

  if (!existing) {
    await db.insert(streaks).values({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastStudyDate: today,
      totalXp: xpGained,
    });
    return;
  }

  const lastDate = existing.lastStudyDate;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let newStreak = existing.currentStreak;
  if (lastDate === today) {
    // Already studied today — just add XP
  } else if (lastDate === yesterday) {
    newStreak += 1;
  } else {
    // Streak broken
    newStreak = 1;
  }

  const newLongest = Math.max(newStreak, existing.longestStreak);

  await db
    .update(streaks)
    .set({
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastStudyDate: today,
      totalXp: existing.totalXp + xpGained,
    })
    .where(eq(streaks.userId, userId));
}
