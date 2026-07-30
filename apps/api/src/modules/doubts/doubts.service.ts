import { and, asc, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { courses, currentAffairs, doubts } from '../../../drizzle/schema.js';
import { aiEnabled, aiResolveDoubt, AiUnavailableError } from '../../lib/ai-client.js';
import { searchChunks } from '../rag/rag.service.js';
import { logger } from '../../lib/logger.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';
import type { AnswerDoubtInput, AssignDoubtInput, CreateDoubtInput, ListDoubtsInput } from './doubts.schema.js';

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Retrieval for doubt grounding: pgvector semantic search first; falls back
 * to keyword matching when embeddings are unavailable or nothing indexed.
 */
async function findContextChunks(subject: string, question: string) {
  const semantic = await searchChunks(`${subject}: ${question}`, 5);
  if (semantic.length > 0) {
    return semantic.map((c) => ({ source: c.source.slice(0, 200), text: c.text }));
  }
  return findContextChunksKeyword(subject, question);
}

async function findContextChunksKeyword(subject: string, question: string) {
  const words = question
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length >= 4)
    .slice(0, 3);

  const caConditions = words.map((w) => ilike(currentAffairs.title, `%${w}%`));

  const [courseRows, caRows] = await Promise.all([
    db
      .select({ title: courses.title, description: courses.description })
      .from(courses)
      .where(and(ilike(courses.subject, `%${subject}%`), eq(courses.isPublished, true)))
      .limit(2),
    caConditions.length
      ? db
          .select({ title: currentAffairs.title, summary: currentAffairs.summary })
          .from(currentAffairs)
          .where(or(...caConditions))
          .orderBy(desc(currentAffairs.publishedAt))
          .limit(3)
      : Promise.resolve([]),
  ]);

  const chunks: { source: string; text: string }[] = [];
  for (const r of courseRows) {
    if (r.description && r.description.length > 40) {
      chunks.push({ source: r.title, text: r.description.slice(0, 3000) });
    }
  }
  for (const r of caRows) {
    chunks.push({ source: r.title.slice(0, 200), text: r.summary.slice(0, 3000) });
  }
  return chunks;
}

export async function createDoubt(studentId: string, input: CreateDoubtInput) {
  const [doubt] = await db
    .insert(doubts)
    .values({
      studentId,
      subject: input.subject,
      body: input.body,
      imageUrl: input.imageUrl,
      status: 'open',
    })
    .returning();

  if (!doubt) throw new Error('Failed to create doubt');

  if (!aiEnabled()) {
    // No AI configured — goes straight to the mentor queue
    const [updated] = await db
      .update(doubts)
      .set({ status: 'escalated' })
      .where(eq(doubts.id, doubt.id))
      .returning();
    return updated!;
  }

  try {
    const context = await findContextChunks(input.subject, input.body);
    const result = await aiResolveDoubt({
      question: input.body,
      subject: input.subject,
      context,
      language: input.language,
    });

    const [updated] = await db
      .update(doubts)
      .set({
        aiAnswer: result.answer,
        aiConfidence: result.confidence,
        status: result.escalate ? 'escalated' : 'ai_answered',
      })
      .where(eq(doubts.id, doubt.id))
      .returning();
    return updated!;
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) {
      logger.error({ err, doubtId: doubt.id }, 'Doubt AI resolution failed unexpectedly');
    }
    // AI failed — escalate so a mentor picks it up
    const [updated] = await db
      .update(doubts)
      .set({ status: 'escalated' })
      .where(eq(doubts.id, doubt.id))
      .returning();
    return updated!;
  }
}

export async function listMyDoubts(studentId: string, input: ListDoubtsInput) {
  const where = input.status
    ? and(eq(doubts.studentId, studentId), eq(doubts.status, input.status))
    : eq(doubts.studentId, studentId);

  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(doubts)
      .where(where)
      .orderBy(desc(doubts.createdAt))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ value: count() }).from(doubts).where(where),
  ]);

  return { items, total: total?.value ?? 0 };
}

export async function getDoubt(doubtId: string, userId: string, role: string) {
  const [doubt] = await db.select().from(doubts).where(eq(doubts.id, doubtId)).limit(1);
  if (!doubt) throw new NotFoundError('Doubt not found');
  if (role === 'student' && doubt.studentId !== userId) {
    throw new ForbiddenError('Not your doubt');
  }
  return doubt;
}

export async function listAllDoubts(input: ListDoubtsInput) {
  const conds = [];
  if (input.status) conds.push(eq(doubts.status, input.status));
  if (input.assignedTo) conds.push(eq(doubts.assignedTo, input.assignedTo));
  if (input.unassigned) conds.push(isNull(doubts.assignedTo));
  const where = conds.length ? and(...conds) : undefined;
  const order = input.sort === 'oldest' ? asc(doubts.createdAt) : desc(doubts.createdAt);

  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(doubts)
      .where(where)
      .orderBy(order)
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ value: count() }).from(doubts).where(where),
  ]);

  const now = Date.now();
  const withAge = items.map((d) => ({ ...d, ageMins: Math.round((now - d.createdAt.getTime()) / 60000) }));

  return { items: withAge, total: total?.value ?? 0 };
}

/** Pre-assign an open/escalated doubt to a staff member before it's answered. */
export async function assignDoubt(doubtId: string, input: AssignDoubtInput) {
  const [doubt] = await db.select().from(doubts).where(eq(doubts.id, doubtId)).limit(1);
  if (!doubt) throw new NotFoundError('Doubt not found');
  if (doubt.status === 'resolved') {
    throw Object.assign(new Error('This doubt is already resolved'), { statusCode: 400, code: 'ALREADY_RESOLVED' });
  }

  const [updated] = await db
    .update(doubts)
    .set({ assignedTo: input.assignedTo, assignedAt: new Date() })
    .where(eq(doubts.id, doubtId))
    .returning();
  return updated!;
}

export async function answerDoubt(doubtId: string, mentorId: string, input: AnswerDoubtInput) {
  const [doubt] = await db.select().from(doubts).where(eq(doubts.id, doubtId)).limit(1);
  if (!doubt) throw new NotFoundError('Doubt not found');

  const [updated] = await db
    .update(doubts)
    .set({
      humanAnswer: input.answer,
      assignedTo: mentorId,
      status: 'resolved',
      resolvedAt: new Date(),
    })
    .where(eq(doubts.id, doubtId))
    .returning();

  // Notify the student; a notification failure must not fail the answer
  try {
    await sendNotificationToUser(
      doubt.studentId,
      'Your doubt has been answered',
      `A mentor replied to your ${doubt.subject} doubt.`,
      'doubt_reply',
      { doubtId },
    );
  } catch (err) {
    logger.error({ err, doubtId }, 'Failed to notify student of doubt reply');
  }

  return updated!;
}
