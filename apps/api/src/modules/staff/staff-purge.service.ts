import { and, count, eq, gt, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { revokeUserSessions } from '../../middleware/authenticate.js';
import { bustStaffRoleCache } from '../../middleware/require-permission.js';
import {
  users, admissions, payments, leads, leadFollowups, doubts, courses, exams, liveClasses,
  batchInstructors, mentorBatches, auditLogs,
} from '../../../drizzle/schema.js';
import { getStaffById } from './staff.service.js';

/**
 * Permanent (hard) deletion of a staff member, for an administrator.
 *
 * "Disable" is the everyday way to take someone's access away: it keeps their
 * name on the leads, follow-ups and payments they handled. This removes the
 * account itself, for staff added by mistake, test accounts and duplicates,
 * and frees the email and mobile number for reuse.
 *
 * What happens to their work:
 *  - Leads they own become unassigned. Follow-ups, stage changes, admissions
 *    and payments they recorded stay, without their name (foreign keys SET NULL).
 *  - Doubts assigned to them return to the mentor queue; answers they gave stay.
 *  - Courses and tests they created, and live classes already held, pass to the
 *    admin doing the deletion: each of those must belong to someone.
 *  - Batch instructor and mentor assignments, roles, sessions, devices and
 *    their HR profile go with the account (foreign keys CASCADE).
 *  - The audit log keeps their name: it is written into each of their entries
 *    before the account goes.
 *
 * Refused while they have a live class still to teach: someone has to be
 * given it first. Nobody can delete their own account.
 */

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

export interface StaffDeletionImpact {
  staffId: string;
  name: string;
  employeeId: string | null;
  email: string | null;
  phone: string;
  roles: string[];
  leadsOwned: number;           // become unassigned
  followUps: number;            // stay, without the name
  admissions: number;           // stay, without the counsellor
  paymentsHandled: number;      // stay, without who collected or verified them
  doubtsInProgress: number;     // go back to the mentor queue
  doubtsAnswered: number;       // answers stay
  coursesCreated: number;       // pass to the deleting admin
  testsCreated: number;         // pass to the deleting admin
  batchesTaught: number;        // instructor assignments removed
  mentorBatches: number;        // mentor assignments removed
  pastLiveClasses: number;      // pass to the deleting admin
  upcomingLiveClasses: number;  // block the deletion
  auditEntries: number;         // keep the name
}

export async function staffDeletionImpact(staffId: string): Promise<StaffDeletionImpact> {
  const staff = await getStaffById(staffId); // 404 unless this is a staff account
  const now = new Date();
  const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

  const [owned, followUps, adms, pays, doubtsOpen, doubtsDone, crs, tests, taught, mentored, past, upcoming, audit] =
    await Promise.all([
      db.select({ n: count() }).from(leads).where(eq(leads.ownerId, staffId)),
      db.select({ n: count() }).from(leadFollowups).where(eq(leadFollowups.staffId, staffId)),
      db.select({ n: count() }).from(admissions).where(eq(admissions.counsellorId, staffId)),
      db.select({ n: count() }).from(payments).where(or(eq(payments.collectedBy, staffId), eq(payments.verifiedBy, staffId))),
      db.select({ n: count() }).from(doubts).where(and(eq(doubts.assignedTo, staffId), ne(doubts.status, 'resolved'))),
      db.select({ n: count() }).from(doubts).where(and(eq(doubts.assignedTo, staffId), eq(doubts.status, 'resolved'))),
      db.select({ n: count() }).from(courses).where(eq(courses.createdBy, staffId)),
      db.select({ n: count() }).from(exams).where(eq(exams.createdBy, staffId)),
      db.select({ n: count() }).from(batchInstructors).where(eq(batchInstructors.instructorId, staffId)),
      db.select({ n: count() }).from(mentorBatches).where(eq(mentorBatches.mentorId, staffId)),
      db.select({ n: count() }).from(liveClasses).where(and(
        eq(liveClasses.instructorId, staffId),
        or(eq(liveClasses.isCompleted, true), lte(liveClasses.startTime, now)),
      )),
      db.select({ n: count() }).from(liveClasses).where(and(
        eq(liveClasses.instructorId, staffId),
        eq(liveClasses.isCompleted, false),
        gt(liveClasses.startTime, now),
      )),
      db.select({ n: count() }).from(auditLogs).where(eq(auditLogs.actorUserId, staffId)),
    ]);

  return {
    staffId,
    name: staff.name,
    employeeId: staff.employeeId,
    email: staff.email,
    phone: staff.phone,
    roles: staff.staffRoles.map((r) => r.name),
    leadsOwned: n(owned),
    followUps: n(followUps),
    admissions: n(adms),
    paymentsHandled: n(pays),
    doubtsInProgress: n(doubtsOpen),
    doubtsAnswered: n(doubtsDone),
    coursesCreated: n(crs),
    testsCreated: n(tests),
    batchesTaught: n(taught),
    mentorBatches: n(mentored),
    pastLiveClasses: n(past),
    upcomingLiveClasses: n(upcoming),
    auditEntries: n(audit),
  };
}

export async function deleteStaffPermanently(staffId: string, actingAdminId: string) {
  if (staffId === actingAdminId) throw err('You cannot delete your own account', 400, 'CANNOT_DELETE_SELF');

  const impact = await staffDeletionImpact(staffId);
  if (impact.upcomingLiveClasses > 0) {
    throw err(
      `${impact.name} still has ${impact.upcomingLiveClasses} live class(es) to teach. Give them to someone else first.`,
      409,
      'HAS_UPCOMING_CLASSES',
    );
  }

  await db.transaction(async (tx) => {
    // The audit log points at the account, and that link is cleared when the
    // account goes. Keep the name in each entry so "who did this" survives.
    await tx
      .update(auditLogs)
      .set({ meta: sql`coalesce(${auditLogs.meta}, '{}'::jsonb) || jsonb_build_object('actorName', ${impact.name}::text)` })
      .where(eq(auditLogs.actorUserId, staffId));

    // Doubts they were handling go back to the queue; the status is untouched,
    // so answered ones stay answered.
    await tx.update(doubts).set({ assignedTo: null, assignedAt: null }).where(eq(doubts.assignedTo, staffId));

    // Things that must belong to someone pass to the admin deleting them.
    await tx.update(courses).set({ createdBy: actingAdminId }).where(eq(courses.createdBy, staffId));
    await tx.update(exams).set({ createdBy: actingAdminId }).where(eq(exams.createdBy, staffId));
    await tx.update(liveClasses).set({ instructorId: actingAdminId }).where(eq(liveClasses.instructorId, staffId));

    // The account. Roles, HR profile, instructor and mentor assignments,
    // targets, sessions, devices and notifications cascade from it; leads,
    // follow-ups, admissions and payments keep their rows and lose the link.
    const gone = await tx
      .delete(users)
      .where(and(eq(users.id, staffId), eq(users.role, 'staff')))
      .returning({ id: users.id });
    if (gone.length !== 1) throw err('Staff member could not be deleted', 409, 'DELETE_FAILED');
  });

  // Tokens already issued die with the account, and so does its cached role set.
  await revokeUserSessions(staffId);
  await bustStaffRoleCache(staffId);

  return impact;
}
