import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { getSetting } from '../settings/settings.service.js';
import { courses, currentAffairs, doubts } from '../../../drizzle/schema.js';
import { aiEnabled, aiResolveDoubt, AiUnavailableError } from '../../lib/ai-client.js';
import { searchChunks } from '../rag/rag.service.js';
import { logger } from '../../lib/logger.js';
import { startOfIstDay } from '../../lib/ist.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';
import type { AnswerDoubtInput, AssignDoubtInput, CreateDoubtInput, ListDoubtsInput } from './doubts.schema.js';

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Retrieval for doubt grounding: pgvector semantic search first; falls back
 * to keyword matching when embeddings are unavailable or nothing indexed.
 */
async function findContextChunks(subject: string, question: string) {
  // The five closest matches of any kind, plus the three closest news items.
  const semantic = await searchChunks(`${subject}: ${question}`, 5, { news: 3 });
  if (semantic.length > 0) {
    return withinBudget(
      semantic.map((c) => ({
        source: c.sourceType === 'current_affair' ? newsSource(c.source, c.publishedAt) : c.source.slice(0, 200),
        text: c.text,
      })),
    );
  }
  return withinBudget(await findContextChunksKeyword(subject, question));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * How a current-affairs item is titled for the AI: "Current affairs, 12 Sep
 * 2025: …". The date is what lets it tell this year's news from last year's,
 * and the prefix is how the AI service knows an answer rests on dated news.
 */
export function newsSource(title: string, publishedAt: Date | null): string {
  let prefix = 'Current affairs: ';
  if (publishedAt) {
    const ist = new Date(publishedAt.getTime() + 5.5 * 60 * 60 * 1000);
    prefix = `Current affairs, ${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}: `;
  }
  return (prefix + title).slice(0, 200);
}

// Context is most of what a doubt costs, and the AI provider's allowance is
// counted in tokens per minute: at 12,000 characters a doubt, two students
// asking in the same minute used it up. About 6,000 keeps the best matches
// and roughly halves the cost.
const CONTEXT_BUDGET_CHARS = 6_000;
const CONTEXT_CHUNK_CHARS = 1_500;

export function withinBudget(chunks: { source: string; text: string }[]): { source: string; text: string }[] {
  const out: { source: string; text: string }[] = [];
  let used = 0;
  for (const c of chunks) {
    const text = c.text.slice(0, CONTEXT_CHUNK_CHARS);
    if (out.length >= 8 || used + text.length > CONTEXT_BUDGET_CHARS) break;
    out.push({ source: c.source, text });
    used += text.length;
  }
  return out;
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
          .select({ title: currentAffairs.title, summary: currentAffairs.summary, publishedAt: currentAffairs.publishedAt })
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
    chunks.push({ source: newsSource(r.title, r.publishedAt), text: r.summary.slice(0, 3000) });
  }
  return chunks;
}

/**
 * How many AI answers a student has had today against the academy's daily
 * limit. Only answers actually given count: a doubt the AI could not answer,
 * or one sent to a mentor, uses nothing.
 */
export async function aiAnswerQuota(studentId: string, limit?: number) {
  const max = limit ?? (await getSetting('aiDoubtsDailyLimit'));
  const [row] = await db
    .select({ value: count() })
    .from(doubts)
    .where(and(eq(doubts.studentId, studentId), isNotNull(doubts.aiAnswer), gte(doubts.createdAt, startOfIstDay())));
  const used = Number(row?.value ?? 0);
  return { limit: max, used, left: Math.max(0, max - used) };
}

export async function createDoubt(studentId: string, input: CreateDoubtInput) {
  // Checked before the doubt is stored, so the count is of earlier answers.
  const wantsAi = input.requestedRoute === 'ai';
  const academyAllowsAi = await getSetting('aiDoubtsEnabled');
  const quota = wantsAi && academyAllowsAi && aiEnabled() ? await aiAnswerQuota(studentId) : null;
  const aiLimitReached = quota !== null && quota.left <= 0;

  const [doubt] = await db
    .insert(doubts)
    .values({
      studentId,
      subject: input.subject,
      body: input.body,
      imageUrl: input.imageUrl,
      requestedRoute: input.requestedRoute,
      status: 'open',
    })
    .returning();

  if (!doubt) throw new Error('Failed to create doubt');

  // Four things must all agree before the AI answers: the student asked for
  // it, the academy has AI doubts switched on, an AI is actually configured,
  // and the student has AI answers left today. Past the daily limit the doubt
  // is not refused: it goes to a mentor, which every app build shows properly
  // (a refusal reads as "check your connection" in installed builds).
  if (!wantsAi || !academyAllowsAi || !aiEnabled() || aiLimitReached) {
    // Straight to the mentor queue, which is what 'escalated' means here.
    const [updated] = await db
      .update(doubts)
      .set({ status: 'escalated' })
      .where(eq(doubts.id, doubt.id))
      .returning();
    return aiLimitReached
      ? {
          ...updated!,
          aiLimitReached: true,
          notice: `You have used today's ${quota!.limit} AI answers, so this doubt has gone to a mentor.`,
        }
      : updated!;
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
