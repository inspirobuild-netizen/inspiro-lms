import { eq, and, count, sql, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  batches,
  users,
  staffRoles,
  mentorProfiles,
  mentorBatches,
  batchEnrollments,
  lessons,
  modules,
  lessonProgress,
  examAttempts,
  courses,
} from '../../../drizzle/schema.js';

/**
 * Mentor configuration and scoping.
 *
 * A mentor is a staff user holding the Mentor role: one core subject, a list
 * of strong-area subjects, and an admin-managed mapping to batches. The
 * mapping is what scopes everything a mentor can touch; the coordinator has
 * no profile and is therefore unscoped (their permissions already say what
 * they may do).
 */

function err(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

// ── Admin: list mentors with profile + mapping ────────────────────────────────
export async function listMentors() {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      isActive: users.isActive,
      coreSubject: mentorProfiles.coreSubject,
      strongSubjects: mentorProfiles.strongSubjects,
    })
    .from(users)
    .innerJoin(staffRoles, eq(users.staffRoleId, staffRoles.id))
    .leftJoin(mentorProfiles, eq(mentorProfiles.userId, users.id))
    .where(eq(staffRoles.slug, 'mentor'));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const mapping = await db
    .select({ mentorId: mentorBatches.mentorId, batchId: mentorBatches.batchId, batchName: batches.name })
    .from(mentorBatches)
    .innerJoin(batches, eq(batches.id, mentorBatches.batchId))
    .where(inArray(mentorBatches.mentorId, ids));

  return rows.map((r) => ({
    ...r,
    strongSubjects: r.strongSubjects ?? [],
    batches: mapping.filter((m) => m.mentorId === r.id).map((m) => ({ id: m.batchId, name: m.batchName })),
  }));
}

// ── Admin: set subject profile ────────────────────────────────────────────────
export async function setMentorProfile(userId: string, coreSubject: string, strongSubjects: string[]) {
  const [user] = await db
    .select({ id: users.id, slug: staffRoles.slug })
    .from(users)
    .leftJoin(staffRoles, eq(users.staffRoleId, staffRoles.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw err('User not found', 404, 'USER_NOT_FOUND');
  if (user.slug !== 'mentor') throw err('This staff member does not hold the Mentor role', 400, 'NOT_A_MENTOR');

  const [profile] = await db
    .insert(mentorProfiles)
    .values({ userId, coreSubject, strongSubjects })
    .onConflictDoUpdate({
      target: mentorProfiles.userId,
      set: { coreSubject, strongSubjects, updatedAt: new Date() },
    })
    .returning();
  return profile!;
}

// ── Admin: replace the batch mapping wholesale ────────────────────────────────
export async function setMentorBatches(userId: string, batchIds: string[]) {
  return db.transaction(async (tx) => {
    await tx.delete(mentorBatches).where(eq(mentorBatches.mentorId, userId));
    if (batchIds.length) {
      await tx.insert(mentorBatches).values(batchIds.map((batchId) => ({ mentorId: userId, batchId })));
    }
    return { batchIds };
  });
}

// ── Scoping ───────────────────────────────────────────────────────────────────
/**
 * Which batches this user may touch. null = unrestricted (admin, or staff
 * without a mentor profile — i.e. the coordinator). Having a mentor profile
 * is what makes a user batch-scoped.
 */
export async function allowedBatchIds(userId: string, role: string): Promise<string[] | null> {
  if (role === 'admin') return null;
  const [profile] = await db
    .select({ userId: mentorProfiles.userId })
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, userId))
    .limit(1);
  if (!profile) return null;
  const rows = await db
    .select({ batchId: mentorBatches.batchId })
    .from(mentorBatches)
    .where(eq(mentorBatches.mentorId, userId));
  return rows.map((r) => r.batchId);
}

export async function assertBatchAllowed(userId: string, role: string, batchId: string): Promise<void> {
  const allowed = await allowedBatchIds(userId, role);
  if (allowed !== null && !allowed.includes(batchId)) {
    throw err('You are not mapped to this batch', 403, 'BATCH_NOT_MAPPED');
  }
}

// ── Mentor: my batches ────────────────────────────────────────────────────────
export async function getMentorBatches(userId: string) {
  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      status: batches.status,
      courseTitle: courses.title,
      students: sql<number>`(select count(*) from batch_enrollments be
        where be.batch_id = ${batches.id} and be.status = 'active')`,
    })
    .from(mentorBatches)
    .innerJoin(batches, eq(batches.id, mentorBatches.batchId))
    .leftJoin(courses, eq(courses.id, batches.courseId))
    .where(eq(mentorBatches.mentorId, userId));
  return rows.map((r) => ({ ...r, students: Number(r.students) }));
}

// ── Batch performance: class-viewing status + exam results per student ────────
// Four grouped queries and a merge — no per-student round trips, whatever the
// batch size.
export async function getBatchPerformance(batchId: string, userId: string, role: string) {
  await assertBatchAllowed(userId, role, batchId);

  const [batch] = await db
    .select({ id: batches.id, name: batches.name, courseId: batches.courseId })
    .from(batches)
    .where(eq(batches.id, batchId))
    .limit(1);
  if (!batch) throw err('Batch not found', 404, 'BATCH_NOT_FOUND');

  const students = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(batchEnrollments)
    .innerJoin(users, eq(users.id, batchEnrollments.userId))
    .where(and(eq(batchEnrollments.batchId, batchId), eq(batchEnrollments.status, 'active')));
  if (students.length === 0) return { batch, totalLessons: 0, students: [] };
  const studentIds = students.map((s) => s.id);

  const [{ totalLessons }] = await db
    .select({ totalLessons: count() })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(modules.courseId, batch.courseId));

  const progress = await db
    .select({
      userId: lessonProgress.userId,
      completed: sql<number>`count(*) filter (where ${lessonProgress.isCompleted})`,
      lastWatched: sql<Date>`max(${lessonProgress.lastWatchedAt})`,
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(modules.courseId, batch.courseId), inArray(lessonProgress.userId, studentIds)))
    .groupBy(lessonProgress.userId);
  const progressBy = new Map(progress.map((p) => [p.userId, p]));

  const attempts = await db
    .select({
      studentId: examAttempts.studentId,
      attempts: count(),
      avgPercent: sql<number>`coalesce(avg(case when ${examAttempts.maxScore} > 0
        then 100.0 * ${examAttempts.score} / ${examAttempts.maxScore} end), 0)`,
    })
    .from(examAttempts)
    .where(and(inArray(examAttempts.studentId, studentIds), sql`${examAttempts.submittedAt} is not null`))
    .groupBy(examAttempts.studentId);
  const attemptsBy = new Map(attempts.map((a) => [a.studentId, a]));

  return {
    batch,
    totalLessons: Number(totalLessons),
    students: students.map((s) => {
      const pr = progressBy.get(s.id);
      const at = attemptsBy.get(s.id);
      return {
        ...s,
        lessonsCompleted: Number(pr?.completed ?? 0),
        lastWatchedAt: pr?.lastWatched ?? null,
        examAttempts: Number(at?.attempts ?? 0),
        examAvgPercent: Math.round(Number(at?.avgPercent ?? 0)),
      };
    }),
  };
}
