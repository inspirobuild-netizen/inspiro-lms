import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { revokeUserSessions } from '../../middleware/authenticate.js';
import {
  users, refreshTokens, deviceTokens, notifications, lessonProgress, streaks, leaderboard,
  doubts, activitySubmissions, studentFeedback, studentVerification, examAttempts,
  batchEnrollments, enrollmentRequests, attendance,
} from '../../../drizzle/schema.js';

/**
 * Self-service account deletion, as both app stores require.
 *
 * The user row is anonymised rather than removed. Admission and payment
 * records must survive — they are the academy's financial records, with a
 * statutory retention period — and they reference the user. Deleting the row
 * would either cascade the ledger away or be refused by the foreign keys.
 * Anonymising keeps the ledger intact against an entry that no longer names
 * anyone.
 *
 * Everything that is personal but not financial is removed outright: who
 * they are, how to reach them, what they watched, what they asked, what
 * they submitted. Enrolments go too, so the account can open nothing even if
 * it were somehow signed in.
 *
 * The phone is rewritten to a value that cannot be dialled and cannot
 * collide, so signing in again with the real number creates a fresh account —
 * which is the behaviour the stores' policies describe.
 */
export async function deleteOwnAccount(userId: string) {
  const [u] = await db.select({ id: users.id, role: users.role, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw Object.assign(new Error('Account not found'), { statusCode: 404, code: 'NOT_FOUND' });
  if (u.role !== 'student') {
    throw Object.assign(new Error('Staff accounts are removed by an administrator, not from the app.'), {
      statusCode: 403,
      code: 'STAFF_ACCOUNT',
    });
  }

  const tombstone = `del-${userId.slice(0, 8)}`; // fits varchar(15); unique per user

  await db.transaction(async (tx) => {
    // Sessions and reach first: nothing else should be able to act as them.
    await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    await tx.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));

    // Learning and personal activity.
    await tx.delete(lessonProgress).where(eq(lessonProgress.userId, userId));
    await tx.delete(streaks).where(eq(streaks.userId, userId));
    await tx.delete(leaderboard).where(eq(leaderboard.studentId, userId));
    await tx.delete(examAttempts).where(eq(examAttempts.studentId, userId));
    await tx.delete(doubts).where(eq(doubts.studentId, userId));
    await tx.delete(activitySubmissions).where(eq(activitySubmissions.studentId, userId));
    await tx.delete(studentFeedback).where(eq(studentFeedback.studentId, userId));
    await tx.delete(studentVerification).where(eq(studentVerification.studentId, userId));
    await tx.delete(attendance).where(eq(attendance.studentId, userId));

    // Access. Unsettled requests are noise; verified ones point at an
    // admission and stay with it.
    await tx.delete(batchEnrollments).where(eq(batchEnrollments.userId, userId));
    await tx
      .delete(enrollmentRequests)
      .where(and(eq(enrollmentRequests.studentId, userId), inArray(enrollmentRequests.status, ['pending', 'failed', 'rejected'])));

    // Identity, last.
    await tx
      .update(users)
      .set({
        name: 'Deleted user',
        phone: tombstone,
        email: null,
        passwordHash: null,
        avatarUrl: null,
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });

  // Refresh tokens are gone above; this kills the access tokens already out
  // there, on every device, for the rest of their lifetime.
  await revokeUserSessions(userId);

  return { deleted: true, formerPhone: u.phone };
}
