import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { users, studentVerification } from '../../../drizzle/schema.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

async function getStudent(id: string) {
  const [student] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, 'student'))).limit(1);
  if (!student) throw err('Student not found', 404, 'STUDENT_NOT_FOUND');
  return student;
}

export async function listByStatus(opts: { status: string; page: number; limit: number; search?: string }) {
  const conds = [eq(users.role, 'student'), eq(users.verificationStatus, opts.status as never)];
  if (opts.search) {
    const s = `%${opts.search}%`;
    conds.push(or(ilike(users.name, s), ilike(users.phone, s), ilike(users.email, s))!);
  }
  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  const items = await db
    .select({ id: users.id, name: users.name, phone: users.phone, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);
  return { items, total };
}

export async function getCounts() {
  const rows = await db
    .select({ status: users.verificationStatus, n: count() })
    .from(users)
    .where(eq(users.role, 'student'))
    .groupBy(users.verificationStatus);
  const counts = { pending: 0, verified: 0, rejected: 0 };
  for (const r of rows) counts[r.status as keyof typeof counts] = Number(r.n);
  return counts;
}

export async function getHistory(studentId: string) {
  return db
    .select({
      id: studentVerification.id, status: studentVerification.status, submittedAt: studentVerification.submittedAt,
      reviewedAt: studentVerification.reviewedAt, rejectionReason: studentVerification.rejectionReason,
      reviewerName: users.name,
    })
    .from(studentVerification)
    .leftJoin(users, eq(users.id, studentVerification.reviewedBy))
    .where(eq(studentVerification.studentId, studentId))
    .orderBy(desc(studentVerification.submittedAt));
}

export async function approve(studentId: string, reviewerId: string) {
  const student = await getStudent(studentId);
  await db.update(users).set({ verificationStatus: 'verified', updatedAt: new Date() }).where(eq(users.id, studentId));
  await db.insert(studentVerification).values({ studentId, status: 'verified', reviewedBy: reviewerId, reviewedAt: new Date() });
  await sendNotificationToUser(studentId, 'Account approved', 'Your account has been verified — you now have full access.', 'verification_update');
  return { ...student, verificationStatus: 'verified' as const };
}

export async function reject(studentId: string, reviewerId: string, reason: string) {
  const student = await getStudent(studentId);
  await db.update(users).set({ verificationStatus: 'rejected', updatedAt: new Date() }).where(eq(users.id, studentId));
  await db.insert(studentVerification).values({ studentId, status: 'rejected', reviewedBy: reviewerId, reviewedAt: new Date(), rejectionReason: reason });
  await sendNotificationToUser(studentId, 'Verification rejected', reason, 'verification_update');
  return { ...student, verificationStatus: 'rejected' as const };
}

// Keeps the student pending, but records feedback + notifies them to resubmit.
export async function requestChanges(studentId: string, reviewerId: string, note: string) {
  const student = await getStudent(studentId);
  await db.insert(studentVerification).values({ studentId, status: 'pending', reviewedBy: reviewerId, reviewedAt: new Date(), rejectionReason: note });
  await sendNotificationToUser(studentId, 'Changes requested', note, 'verification_update');
  return student;
}

// ── Merge a duplicate student account into the primary ────────────────────────
// Conflict-safe: for tables with a unique constraint spanning the student FK,
// rows that would collide with an existing primary-owned row are dropped
// rather than reassigned (the primary's row already covers that relationship).
export async function mergeDuplicate(primaryId: string, duplicateId: string) {
  if (primaryId === duplicateId) throw err('Cannot merge a student into themself', 400, 'SAME_STUDENT');
  await getStudent(primaryId);
  await getStudent(duplicateId);

  await db.transaction(async (tx) => {
    // Unique-constrained children: move what we can, drop what would collide.
    await tx.execute(sql`UPDATE batch_enrollments SET user_id = ${primaryId}
      WHERE user_id = ${duplicateId} AND NOT EXISTS (
        SELECT 1 FROM batch_enrollments b2 WHERE b2.user_id = ${primaryId} AND b2.batch_id = batch_enrollments.batch_id)`);
    await tx.execute(sql`DELETE FROM batch_enrollments WHERE user_id = ${duplicateId}`);

    await tx.execute(sql`UPDATE lesson_progress SET user_id = ${primaryId}
      WHERE user_id = ${duplicateId} AND NOT EXISTS (
        SELECT 1 FROM lesson_progress l2 WHERE l2.user_id = ${primaryId} AND l2.lesson_id = lesson_progress.lesson_id)`);
    await tx.execute(sql`DELETE FROM lesson_progress WHERE user_id = ${duplicateId}`);

    await tx.execute(sql`UPDATE leaderboard SET student_id = ${primaryId}
      WHERE student_id = ${duplicateId} AND NOT EXISTS (
        SELECT 1 FROM leaderboard l2 WHERE l2.student_id = ${primaryId} AND l2.batch_id IS NOT DISTINCT FROM leaderboard.batch_id AND l2.period = leaderboard.period)`);
    await tx.execute(sql`DELETE FROM leaderboard WHERE student_id = ${duplicateId}`);

    // streaks: single row per user — keep primary's, fold in duplicate's XP if primary has none.
    await tx.execute(sql`UPDATE streaks SET user_id = ${primaryId}
      WHERE user_id = ${duplicateId} AND NOT EXISTS (SELECT 1 FROM streaks s2 WHERE s2.user_id = ${primaryId})`);
    await tx.execute(sql`DELETE FROM streaks WHERE user_id = ${duplicateId}`);

    // Simple FK reassigns — no unique constraint on the student column.
    await tx.execute(sql`UPDATE exam_attempts SET student_id = ${primaryId} WHERE student_id = ${duplicateId}`);
    await tx.execute(sql`UPDATE notifications SET user_id = ${primaryId} WHERE user_id = ${duplicateId}`);
    await tx.execute(sql`UPDATE device_tokens SET user_id = ${primaryId} WHERE user_id = ${duplicateId}`);
    await tx.execute(sql`UPDATE doubts SET student_id = ${primaryId} WHERE student_id = ${duplicateId}`);
    await tx.execute(sql`UPDATE attendance SET student_id = ${primaryId} WHERE student_id = ${duplicateId}`);
    await tx.execute(sql`UPDATE admissions SET student_id = ${primaryId} WHERE student_id = ${duplicateId}`);
    await tx.execute(sql`UPDATE leads SET converted_student_id = ${primaryId} WHERE converted_student_id = ${duplicateId}`);
    await tx.execute(sql`UPDATE student_verification SET student_id = ${primaryId} WHERE student_id = ${duplicateId}`);

    // Disable the duplicate rather than deleting it (no hard-delete convention).
    await tx.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, duplicateId));
  });

  return { primaryId, duplicateId, merged: true };
}
