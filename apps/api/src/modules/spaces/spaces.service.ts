import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  activities,
  activitySubmissions,
  batchEnrollments,
  batches,
  studentFeedback,
  users,
} from '../../../drizzle/schema.js';
import { assertBatchAllowed, allowedBatchIds } from '../mentors/mentors.extra.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Activity space + feedback space.
 *
 * Activities are batch-scoped tasks published by a mentor or coordinator;
 * students submit inside the app and staff review with remarks. Feedback is
 * collected from students and read by the academic coordinator. Every list
 * here is one or two indexed queries — nothing loops per student.
 */

function err(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

// ── Staff: publish ────────────────────────────────────────────────────────────
export async function publishActivity(
  input: {
    batchIds: string[];
    title: string;
    description: string;
    dueAt?: string;
    requiresFile?: boolean;
    allowedTypes?: string;
  },
  staffId: string,
  role: string,
) {
  // A mentor may only publish into batches the admin mapped to them.
  for (const batchId of input.batchIds) {
    await assertBatchAllowed(staffId, role, batchId);
  }

  const rows = await db
    .insert(activities)
    .values(
      input.batchIds.map((batchId) => ({
        batchId,
        title: input.title,
        description: input.description,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        requiresFile: input.requiresFile ?? false,
        allowedTypes: input.allowedTypes ?? 'image,pdf',
        createdBy: staffId,
      })),
    )
    .returning();

  // Tell every active student in those batches — the point of publishing is
  // that students see it. Push failure never fails the publish.
  try {
    const enrolled = await db
      .select({ userId: batchEnrollments.userId })
      .from(batchEnrollments)
      .where(and(inArray(batchEnrollments.batchId, input.batchIds), eq(batchEnrollments.status, 'active')));
    const studentIds = [...new Set(enrolled.map((e) => e.userId))];
    const bodyText = `${input.title}${input.dueAt ? ` — due ${new Date(input.dueAt).toLocaleDateString('en-IN')}` : ''}`;
    for (const sid of studentIds) {
      await sendNotificationToUser(sid, 'New activity', bodyText, 'announcement', { kind: 'activity' });
    }
  } catch (e) {
    logger.warn({ e }, 'Could not notify students of new activity');
  }

  return rows;
}

// ── Staff: list activities (scoped for mentors) ───────────────────────────────
export async function listActivitiesForStaff(staffId: string, role: string, batchId?: string) {
  const allowed = await allowedBatchIds(staffId, role);
  const conds = [];
  if (batchId) {
    if (allowed !== null && !allowed.includes(batchId)) {
      throw err('You are not mapped to this batch', 403, 'BATCH_NOT_MAPPED');
    }
    conds.push(eq(activities.batchId, batchId));
  } else if (allowed !== null) {
    if (allowed.length === 0) return [];
    conds.push(inArray(activities.batchId, allowed));
  }

  return db
    .select({
      id: activities.id,
      title: activities.title,
      description: activities.description,
      dueAt: activities.dueAt,
      requiresFile: activities.requiresFile,
      allowedTypes: activities.allowedTypes,
      createdAt: activities.createdAt,
      batchId: activities.batchId,
      batchName: batches.name,
      createdByName: users.name,
      submissions: sql<number>`(select count(*) from activity_submissions s where s.activity_id = ${activities.id})`,
      reviewed: sql<number>`(select count(*) from activity_submissions s
        where s.activity_id = ${activities.id} and s.reviewed_at is not null)`,
      enrolled: sql<number>`(select count(*) from batch_enrollments be
        where be.batch_id = ${activities.batchId} and be.status = 'active')`,
    })
    .from(activities)
    .innerJoin(batches, eq(batches.id, activities.batchId))
    .leftJoin(users, eq(users.id, activities.createdBy))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(activities.createdAt))
    .limit(100);
}

// ── Staff: one activity's submissions ─────────────────────────────────────────
export async function listSubmissions(activityId: string, staffId: string, role: string) {
  const [activity] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!activity) throw err('Activity not found', 404, 'ACTIVITY_NOT_FOUND');
  await assertBatchAllowed(staffId, role, activity.batchId);

  const rows = await db
    .select({
      id: activitySubmissions.id,
      body: activitySubmissions.body,
      imageUrl: activitySubmissions.imageUrl,
      attachments: activitySubmissions.attachments,
      submittedAt: activitySubmissions.submittedAt,
      reviewedAt: activitySubmissions.reviewedAt,
      remarks: activitySubmissions.remarks,
      studentId: users.id,
      studentName: users.name,
      studentPhone: users.phone,
    })
    .from(activitySubmissions)
    .innerJoin(users, eq(users.id, activitySubmissions.studentId))
    .where(eq(activitySubmissions.activityId, activityId))
    .orderBy(desc(activitySubmissions.submittedAt));

  return { activity, submissions: rows };
}

// ── Staff: review a submission ────────────────────────────────────────────────
export async function reviewSubmission(submissionId: string, remarks: string, staffId: string, role: string) {
  const [sub] = await db
    .select({ id: activitySubmissions.id, activityId: activitySubmissions.activityId, studentId: activitySubmissions.studentId })
    .from(activitySubmissions)
    .where(eq(activitySubmissions.id, submissionId))
    .limit(1);
  if (!sub) throw err('Submission not found', 404, 'SUBMISSION_NOT_FOUND');

  const [activity] = await db.select().from(activities).where(eq(activities.id, sub.activityId)).limit(1);
  await assertBatchAllowed(staffId, role, activity!.batchId);

  const [updated] = await db
    .update(activitySubmissions)
    .set({ remarks, reviewedBy: staffId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(activitySubmissions.id, submissionId))
    .returning();

  try {
    await sendNotificationToUser(
      sub.studentId,
      'Activity reviewed',
      `Your submission for "${activity!.title}" has feedback: ${remarks.slice(0, 120)}`,
      'announcement',
      { kind: 'activity' },
    );
  } catch (e) {
    logger.warn({ e, submissionId }, 'Could not notify student of review');
  }
  return updated!;
}

// ── Staff: delete an activity ─────────────────────────────────────────────────
export async function deleteActivity(activityId: string, staffId: string, role: string) {
  const [activity] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!activity) throw err('Activity not found', 404, 'ACTIVITY_NOT_FOUND');
  await assertBatchAllowed(staffId, role, activity.batchId);
  await db.delete(activities).where(eq(activities.id, activityId));
  return { deleted: true };
}

// ── Student: my activities ────────────────────────────────────────────────────
// One joined query: activities of my active batches, with my submission state
// folded in.
export async function listMyActivities(studentId: string) {
  return db
    .select({
      id: activities.id,
      title: activities.title,
      description: activities.description,
      dueAt: activities.dueAt,
      requiresFile: activities.requiresFile,
      allowedTypes: activities.allowedTypes,
      createdAt: activities.createdAt,
      batchName: batches.name,
      submissionId: activitySubmissions.id,
      submittedAt: activitySubmissions.submittedAt,
      reviewedAt: activitySubmissions.reviewedAt,
      remarks: activitySubmissions.remarks,
    })
    .from(activities)
    .innerJoin(batches, eq(batches.id, activities.batchId))
    .innerJoin(
      batchEnrollments,
      and(
        eq(batchEnrollments.batchId, activities.batchId),
        eq(batchEnrollments.userId, studentId),
        eq(batchEnrollments.status, 'active'),
      ),
    )
    .leftJoin(
      activitySubmissions,
      and(eq(activitySubmissions.activityId, activities.id), eq(activitySubmissions.studentId, studentId)),
    )
    .orderBy(desc(activities.createdAt))
    .limit(100);
}

// ── Student: submit (or revise until reviewed) ────────────────────────────────
export type SubmissionAttachment = { name: string; file: string; kind: 'image' | 'pdf' };

export async function submitActivity(
  activityId: string,
  studentId: string,
  body: string | undefined,
  attachments?: SubmissionAttachment[],
) {
  const [activity] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!activity) throw err('Activity not found', 404, 'ACTIVITY_NOT_FOUND');

  // Must actually be an active student of that batch.
  const [enrolled] = await db
    .select({ id: batchEnrollments.id })
    .from(batchEnrollments)
    .where(
      and(
        eq(batchEnrollments.batchId, activity.batchId),
        eq(batchEnrollments.userId, studentId),
        eq(batchEnrollments.status, 'active'),
      ),
    )
    .limit(1);
  if (!enrolled) throw err('You are not enrolled in this batch', 403, 'NOT_ENROLLED');

  // A reviewed submission is frozen — the mentor has already responded to it.
  const [existing] = await db
    .select({ id: activitySubmissions.id, reviewedAt: activitySubmissions.reviewedAt })
    .from(activitySubmissions)
    .where(and(eq(activitySubmissions.activityId, activityId), eq(activitySubmissions.studentId, studentId)))
    .limit(1);
  if (existing?.reviewedAt) {
    throw err('This submission has already been reviewed and can no longer be changed', 400, 'ALREADY_REVIEWED');
  }

  // An activity can ask for written work, uploaded work, or both. Requiring a
  // file when the task is "photograph your answer sheet" is the point; the
  // check lives here so a client cannot skip it.
  const files = attachments ?? [];
  if (activity.requiresFile && files.length === 0) {
    throw err('This activity needs a photo or PDF of your work', 400, 'FILE_REQUIRED');
  }
  if (!activity.requiresFile && files.length === 0 && !body?.trim()) {
    throw err('Write something or attach your work', 400, 'EMPTY_SUBMISSION');
  }

  const [row] = await db
    .insert(activitySubmissions)
    .values({ activityId, studentId, body: body ?? null, attachments: files })
    .onConflictDoUpdate({
      target: [activitySubmissions.activityId, activitySubmissions.studentId],
      set: { body: body ?? null, attachments: files, submittedAt: new Date(), updatedAt: new Date() },
    })
    .returning();
  return row!;
}

// ── Student: send feedback ────────────────────────────────────────────────────
export async function submitFeedback(
  studentId: string,
  input: { category: string; rating?: number; message: string; batchId?: string },
) {
  const [row] = await db
    .insert(studentFeedback)
    .values({
      studentId,
      batchId: input.batchId ?? null,
      category: input.category,
      rating: input.rating ?? null,
      message: input.message,
    })
    .returning();
  return row!;
}

export async function listMyFeedback(studentId: string) {
  return db
    .select()
    .from(studentFeedback)
    .where(eq(studentFeedback.studentId, studentId))
    .orderBy(desc(studentFeedback.createdAt))
    .limit(50);
}

// ── Coordinator: read feedback ────────────────────────────────────────────────
export async function listFeedback(q: { category?: string; batchId?: string; page: number; limit: number }) {
  const conds = [];
  if (q.category) conds.push(eq(studentFeedback.category, q.category));
  if (q.batchId) conds.push(eq(studentFeedback.batchId, q.batchId));
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(studentFeedback).where(where);
  const items = await db
    .select({
      id: studentFeedback.id,
      category: studentFeedback.category,
      rating: studentFeedback.rating,
      message: studentFeedback.message,
      createdAt: studentFeedback.createdAt,
      studentName: users.name,
      studentPhone: users.phone,
      batchName: batches.name,
    })
    .from(studentFeedback)
    .innerJoin(users, eq(users.id, studentFeedback.studentId))
    .leftJoin(batches, eq(batches.id, studentFeedback.batchId))
    .where(where)
    .orderBy(desc(studentFeedback.createdAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  return { items, total: Number(total) };
}

/**
 * Confirms someone may open a file attached to a submission, and hands back
 * the stored filename.
 *
 * A student's answer sheet is not public. Two parties may see it: the student
 * who submitted it, and staff allowed on that batch — the same batch mapping
 * that governs who can review the work at all. Anyone else gets a 404 rather
 * than a 403, so the endpoint does not confirm the file exists.
 */
export async function resolveSubmissionAttachment(
  submissionId: string,
  file: string,
  viewerId: string,
  role: string,
): Promise<{ file: string; kind: 'image' | 'pdf' }> {
  const [row] = await db
    .select({
      studentId: activitySubmissions.studentId,
      attachments: activitySubmissions.attachments,
      batchId: activities.batchId,
    })
    .from(activitySubmissions)
    .innerJoin(activities, eq(activities.id, activitySubmissions.activityId))
    .where(eq(activitySubmissions.id, submissionId))
    .limit(1);
  if (!row) throw err('Not found', 404, 'NOT_FOUND');

  const match = (row.attachments ?? []).find((a) => a.file === file);
  if (!match) throw err('Not found', 404, 'NOT_FOUND');

  if (row.studentId !== viewerId) {
    if (role === 'student') throw err('Not found', 404, 'NOT_FOUND');
    await assertBatchAllowed(viewerId, role, row.batchId);
  }
  return { file: match.file, kind: match.kind };
}
