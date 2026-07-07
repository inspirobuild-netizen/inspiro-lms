import { eq, and, count, inArray, sql } from 'drizzle-orm';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { db } from '../../lib/db.js';
import {
  liveClasses,
  attendance,
  batchEnrollments,
  users,
  batches,
} from '../../../drizzle/schema.js';
import { logger } from '../../lib/logger.js';
import type {
  CreateLiveClassInput,
  UpdateLiveClassInput,
  ListLiveClassesInput,
} from './live.schema.js';

// ── Agora config ──────────────────────────────────────────────────────────────
const AGORA_APP_ID = process.env['AGORA_APP_ID'] ?? '';
const AGORA_APP_CERT = process.env['AGORA_APP_CERT'] ?? '';
const TOKEN_TTL_SECS = 3 * 60 * 60; // 3 hours

if (!AGORA_APP_ID || !AGORA_APP_CERT) {
  logger.warn('AGORA_APP_ID or AGORA_APP_CERT not set — live class tokens will fail');
}

function generateAgoraToken(channelName: string, uid: number, role: 'host' | 'audience'): string {
  const agoraRole = role === 'host' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const expireTs = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECS;
  return RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERT,
    channelName,
    uid,
    agoraRole,
    expireTs,
    expireTs,
  );
}

// Deterministic Agora UID (uint32) from a UUID
function uidFromUuid(uuid: string): number {
  const hex = uuid.replace(/-/g, '');
  let result = 0;
  for (let i = 0; i < hex.length; i += 8) {
    result ^= parseInt(hex.slice(i, i + 8), 16);
  }
  return result >>> 0;
}

function err(msg: string, status: number, code: string) {
  return Object.assign(new Error(msg), { statusCode: status, code });
}

async function assertEnrolledInBatch(userId: string, batchId: string): Promise<void> {
  const [row] = await db
    .select({ id: batchEnrollments.id })
    .from(batchEnrollments)
    .where(
      and(
        eq(batchEnrollments.userId, userId),
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) throw err('You are not enrolled in this batch', 403, 'NOT_ENROLLED');
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN / INSTRUCTOR
// ═════════════════════════════════════════════════════════════════════════════

export async function listLiveClasses(input: ListLiveClassesInput) {
  const { page, limit, batchId, isCompleted } = input;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (batchId) conditions.push(eq(liveClasses.batchId, batchId));
  if (isCompleted !== undefined) conditions.push(eq(liveClasses.isCompleted, isCompleted));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(liveClasses).where(where);
  const items = await db
    .select()
    .from(liveClasses)
    .where(where)
    .orderBy(liveClasses.startTime)
    .limit(limit)
    .offset(offset);

  return { items, total };
}

export async function createLiveClass(data: CreateLiveClassInput) {
  const [cls] = await db
    .insert(liveClasses)
    .values({
      batchId: data.batchId,
      subject: data.subject,
      title: data.title,
      instructorId: data.instructorId,
      startTime: new Date(data.startTime),
      endTime: data.endTime ? new Date(data.endTime) : null,
    })
    .returning();
  return cls!;
}

export async function updateLiveClass(classId: string, data: UpdateLiveClassInput) {
  const [updated] = await db
    .update(liveClasses)
    .set({
      ...data,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined,
    })
    .where(and(eq(liveClasses.id, classId), eq(liveClasses.isCompleted, false)))
    .returning();
  if (!updated) throw err('Live class not found or already completed', 404, 'CLASS_NOT_FOUND');
  return updated;
}

export async function deleteLiveClass(classId: string) {
  const [cls] = await db.select().from(liveClasses).where(eq(liveClasses.id, classId)).limit(1);
  if (!cls) throw err('Live class not found', 404, 'CLASS_NOT_FOUND');
  if (cls.agoraChannel) throw err('Cannot delete a live class that has started', 409, 'CLASS_STARTED');
  await db.delete(liveClasses).where(eq(liveClasses.id, classId));
  return { deleted: true };
}

// Start: assign Agora channel + return host token
export async function startLiveClass(classId: string, instructorId: string) {
  const [cls] = await db.select().from(liveClasses).where(eq(liveClasses.id, classId)).limit(1);
  if (!cls) throw err('Live class not found', 404, 'CLASS_NOT_FOUND');
  if (cls.isCompleted) throw err('This class has already ended', 409, 'CLASS_ENDED');

  const channelName = cls.agoraChannel ?? `inspiro_${cls.id.replace(/-/g, '')}`;
  const uid = uidFromUuid(instructorId);
  const token = generateAgoraToken(channelName, uid, 'host');

  if (!cls.agoraChannel) {
    await db
      .update(liveClasses)
      .set({ agoraChannel: channelName })
      .where(eq(liveClasses.id, classId));
  }

  logger.info({ classId, channelName }, 'Live class host token issued');
  return {
    classId,
    agoraAppId: AGORA_APP_ID,
    channelName,
    agoraToken: token,
    agoraUid: uid,
    title: cls.title,
  };
}

// End: mark isCompleted, stamp endTime
export async function endLiveClass(classId: string) {
  const [cls] = await db.select().from(liveClasses).where(eq(liveClasses.id, classId)).limit(1);
  if (!cls) throw err('Live class not found', 404, 'CLASS_NOT_FOUND');
  if (cls.isCompleted) throw err('Class already ended', 409, 'ALREADY_ENDED');
  if (!cls.agoraChannel) throw err('Class has not started yet', 409, 'NOT_STARTED');

  const [updated] = await db
    .update(liveClasses)
    .set({ isCompleted: true, endTime: new Date() })
    .where(eq(liveClasses.id, classId))
    .returning();

  logger.info({ classId }, 'Live class ended');
  return updated!;
}

export async function getLiveClassAttendance(classId: string) {
  const rows = await db
    .select({
      att: attendance,
      user: { id: users.id, name: users.name, phone: users.phone },
    })
    .from(attendance)
    .innerJoin(users, eq(attendance.studentId, users.id))
    .where(eq(attendance.liveClassId, classId));

  return {
    classId,
    count: rows.length,
    students: rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      phone: r.user.phone,
      status: r.att.status,
      markedAt: r.att.markedAt,
    })),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// STUDENT
// ═════════════════════════════════════════════════════════════════════════════

export async function listAvailableLiveClasses(userId: string, input: ListLiveClassesInput) {
  const { page, limit, isCompleted } = input;
  const offset = (page - 1) * limit;

  const enrollments = await db
    .select({ batchId: batchEnrollments.batchId })
    .from(batchEnrollments)
    .where(and(eq(batchEnrollments.userId, userId), eq(batchEnrollments.status, 'active')));

  if (enrollments.length === 0) return { items: [], total: 0 };

  const batchIds = enrollments.map((e) => e.batchId);
  const conditions = [inArray(liveClasses.batchId, batchIds)];
  if (isCompleted !== undefined) conditions.push(eq(liveClasses.isCompleted, isCompleted));

  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(liveClasses).where(where);
  const items = await db
    .select()
    .from(liveClasses)
    .where(where)
    .orderBy(liveClasses.startTime)
    .limit(limit)
    .offset(offset);

  return { items, total };
}

// Join: verify enrollment, generate audience token, mark attendance
export async function joinLiveClass(classId: string, studentId: string) {
  const [cls] = await db.select().from(liveClasses).where(eq(liveClasses.id, classId)).limit(1);
  if (!cls) throw err('Live class not found', 404, 'CLASS_NOT_FOUND');
  if (!cls.agoraChannel) throw err('This class has not started yet', 409, 'NOT_STARTED');
  if (cls.isCompleted) throw err('This class has ended', 409, 'CLASS_ENDED');

  await assertEnrolledInBatch(studentId, cls.batchId);

  const uid = uidFromUuid(studentId);
  const token = generateAgoraToken(cls.agoraChannel, uid, 'audience');

  // Upsert attendance — today's date, type live_class, status present
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await db
    .insert(attendance)
    .values({
      studentId,
      batchId: cls.batchId,
      liveClassId: classId,
      date: today,
      type: 'live_class',
      status: 'present',
    })
    .onConflictDoNothing();

  return {
    agoraToken: token,
    agoraUid: uid,
    agoraAppId: AGORA_APP_ID,
    channelName: cls.agoraChannel,
    title: cls.title,
    subject: cls.subject,
    instructorId: cls.instructorId,
  };
}
