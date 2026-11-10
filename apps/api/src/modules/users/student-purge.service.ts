import { and, count, eq, or, sql, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { revokeUserSessions } from '../../middleware/authenticate.js';
import {
  users, admissions, payments, leads, batchEnrollments, enrollmentRequests,
  examAttempts, doubts, lessonProgress,
} from '../../../drizzle/schema.js';

/**
 * Permanent (hard) deletion of a student, for an administrator.
 *
 * Different from the app's own "Delete my account", which anonymises the row
 * so the academy's fee records survive. This one removes the person and
 * everything tied to them: the account, admissions with their instalments and
 * payments, enrolments, enrolment requests, test attempts, progress, doubts,
 * notifications, and the CRM leads for their number. Afterwards the mobile
 * number is free: the student can sign up again as a brand-new account, a
 * lead with that number can be converted, and "+ Add student" accepts it.
 *
 * Built for clearing test students. Because it destroys financial records,
 * a student with confirmed (verified) money is refused unless the caller
 * explicitly acknowledges that amount.
 *
 * Most child rows go by the foreign keys' ON DELETE CASCADE from users and
 * admissions; leads are matched by number because a lead points at a student
 * only once converted (and an app sign-up lead never is).
 */

/** Rows matched by the same 10-digit number, however it was typed. */
function samePhone(column: typeof leads.phone, last10: string) {
  return sql`right(regexp_replace(${column}, '[^0-9]', '', 'g'), 10) = ${last10}`;
}

export interface StudentDeletionImpact {
  studentId: string;
  name: string;
  phone: string;
  admissions: string[];         // admission numbers
  confirmedPaid: number;        // verified money that would disappear from the books
  paymentEntries: number;
  leads: number;
  enrolments: number;
  enrolmentRequests: number;
  testAttempts: number;
  doubts: number;
  lessonsWatched: number;
}

async function loadStudent(studentId: string) {
  const [u] = await db
    .select({ id: users.id, name: users.name, phone: users.phone, role: users.role })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);
  if (!u) throw Object.assign(new Error('Student not found'), { statusCode: 404, code: 'NOT_FOUND' });
  if (u.role !== 'student') {
    throw Object.assign(new Error('Only student accounts can be deleted here. Staff are removed from Staff.'), {
      statusCode: 400,
      code: 'NOT_A_STUDENT',
    });
  }
  return u;
}

export async function studentDeletionImpact(studentId: string): Promise<StudentDeletionImpact> {
  const u = await loadStudent(studentId);
  const last10 = u.phone.replace(/\D/g, '').slice(-10);

  const adms = await db.select({ id: admissions.id, no: admissions.admissionNo }).from(admissions).where(eq(admissions.studentId, studentId));
  const admIds = adms.map((a) => a.id);

  const [pay] = admIds.length
    ? await db
        .select({
          n: count(),
          confirmed: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'verified'), 0)`,
        })
        .from(payments)
        .where(inArray(payments.admissionId, admIds))
    : [{ n: 0, confirmed: 0 }];

  const leadWhere = last10.length === 10
    ? or(eq(leads.convertedStudentId, studentId), samePhone(leads.phone, last10))
    : eq(leads.convertedStudentId, studentId);

  const [[l], [e], [r], [a], [d], [p]] = await Promise.all([
    db.select({ n: count() }).from(leads).where(leadWhere),
    db.select({ n: count() }).from(batchEnrollments).where(eq(batchEnrollments.userId, studentId)),
    db.select({ n: count() }).from(enrollmentRequests).where(eq(enrollmentRequests.studentId, studentId)),
    db.select({ n: count() }).from(examAttempts).where(eq(examAttempts.studentId, studentId)),
    db.select({ n: count() }).from(doubts).where(eq(doubts.studentId, studentId)),
    db.select({ n: count() }).from(lessonProgress).where(eq(lessonProgress.userId, studentId)),
  ]);

  return {
    studentId,
    name: u.name,
    phone: u.phone,
    admissions: adms.map((x) => x.no).filter((x): x is string => !!x),
    confirmedPaid: Number(pay?.confirmed ?? 0),
    paymentEntries: Number(pay?.n ?? 0),
    leads: Number(l?.n ?? 0),
    enrolments: Number(e?.n ?? 0),
    enrolmentRequests: Number(r?.n ?? 0),
    testAttempts: Number(a?.n ?? 0),
    doubts: Number(d?.n ?? 0),
    lessonsWatched: Number(p?.n ?? 0),
  };
}

export async function deleteStudentPermanently(studentId: string, opts: { confirmPaid?: boolean } = {}) {
  const impact = await studentDeletionImpact(studentId);

  if (impact.confirmedPaid > 0 && !opts.confirmPaid) {
    throw Object.assign(
      new Error(
        `This student has ₹${impact.confirmedPaid} of confirmed payments. Deleting removes those fee records permanently.`,
      ),
      { statusCode: 409, code: 'HAS_CONFIRMED_PAYMENTS', details: { confirmedPaid: impact.confirmedPaid } },
    );
  }

  const last10 = impact.phone.replace(/\D/g, '').slice(-10);

  await db.transaction(async (tx) => {
    // CRM leads for this person: the converted one and any app/walk-in lead
    // with the same number. Follow-ups and stage history cascade with them.
    await tx
      .delete(leads)
      .where(
        last10.length === 10
          ? or(eq(leads.convertedStudentId, studentId), samePhone(leads.phone, last10))
          : eq(leads.convertedStudentId, studentId),
      );

    // Admissions explicitly (instalments and payments cascade from them), so
    // the fee ledger goes in the same transaction even if a foreign key rule
    // ever changes.
    await tx.delete(admissions).where(eq(admissions.studentId, studentId));

    // The account itself. Enrolments, requests, attempts, progress, doubts,
    // notifications, sessions, devices, streaks, leaderboard rows,
    // verification, attendance, submissions and feedback cascade from it.
    const gone = await tx
      .delete(users)
      .where(and(eq(users.id, studentId), eq(users.role, 'student')))
      .returning({ id: users.id });
    if (gone.length !== 1) {
      throw Object.assign(new Error('Student could not be deleted'), { statusCode: 409, code: 'DELETE_FAILED' });
    }
  });

  // Tokens already issued die with the account on every device.
  await revokeUserSessions(studentId);

  return impact;
}
