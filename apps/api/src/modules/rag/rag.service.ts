import { cosineDistance, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import {
  contentChunks,
  courses,
  currentAffairs,
  questions,
} from '../../../drizzle/schema.js';
import { aiEmbed, aiEnabled } from '../../lib/ai-client.js';
import { logger } from '../../lib/logger.js';

const EMBED_BATCH_SIZE = 32;
const MAX_CHUNK_CHARS = 3000;

interface ChunkInput {
  sourceType: 'course' | 'current_affair' | 'question';
  sourceId: string;
  title: string;
  content: string;
}

async function upsertChunks(chunks: ChunkInput[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await aiEmbed(batch.map((c) => `${c.title}\n${c.content}`));

    const rows = batch.map((c, j) => ({
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      title: c.title.slice(0, 500),
      content: c.content,
      embedding: vectors[j]!,
      updatedAt: new Date(),
    }));

    await db
      .insert(contentChunks)
      .values(rows)
      .onConflictDoUpdate({
        target: [contentChunks.sourceType, contentChunks.sourceId],
        set: {
          title: sql`excluded.title`,
          content: sql`excluded.content`,
          embedding: sql`excluded.embedding`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
    written += rows.length;
  }
  return written;
}

/**
 * Full reindex: embeds course descriptions, current-affairs summaries and
 * question explanations. Idempotent — upserts by (sourceType, sourceId).
 */
export async function reindexAll(): Promise<{ indexed: Record<string, number> }> {
  const [courseRows, caRows, questionRows] = await Promise.all([
    db
      .select({ id: courses.id, title: courses.title, description: courses.description })
      .from(courses)
      .where(eq(courses.isPublished, true)),
    db
      .select({ id: currentAffairs.id, title: currentAffairs.title, summary: currentAffairs.summary })
      .from(currentAffairs),
    db
      .select({ id: questions.id, body: questions.body, explanation: questions.explanation })
      .from(questions)
      .where(isNotNull(questions.explanation)),
  ]);

  const chunks: ChunkInput[] = [];
  for (const c of courseRows) {
    if (c.description && c.description.length > 40) {
      chunks.push({
        sourceType: 'course',
        sourceId: c.id,
        title: c.title,
        content: c.description.slice(0, MAX_CHUNK_CHARS),
      });
    }
  }
  for (const ca of caRows) {
    chunks.push({
      sourceType: 'current_affair',
      sourceId: ca.id,
      title: ca.title,
      content: ca.summary.slice(0, MAX_CHUNK_CHARS),
    });
  }
  for (const q of questionRows) {
    if (q.explanation && q.explanation.length > 40) {
      chunks.push({
        sourceType: 'question',
        sourceId: q.id,
        title: q.body.slice(0, 500),
        content: q.explanation.slice(0, MAX_CHUNK_CHARS),
      });
    }
  }

  const indexed: Record<string, number> = { course: 0, current_affair: 0, question: 0, total: 0 };
  for (const type of ['course', 'current_affair', 'question'] as const) {
    const ofType = chunks.filter((c) => c.sourceType === type);
    indexed[type] = await upsertChunks(ofType);
  }
  indexed['total'] = indexed['course']! + indexed['current_affair']! + indexed['question']!;

  logger.info({ indexed }, 'RAG reindex complete');
  return { indexed };
}

/** Embed a single new item incrementally (best-effort — never throws). */
export async function embedChunk(chunk: ChunkInput): Promise<void> {
  if (!aiEnabled()) return;
  try {
    await upsertChunks([chunk]);
  } catch (err) {
    logger.warn({ err, sourceType: chunk.sourceType, sourceId: chunk.sourceId }, 'Incremental embed failed');
  }
}

export interface FoundChunk {
  source: string;
  text: string;
  similarity: number;
  sourceType: string;
  /** When a current-affairs item was published; null for course material. */
  publishedAt: Date | null;
}

/**
 * Semantic search over indexed content. Returns [] when embeddings are
 * unavailable so callers can fall back to keyword retrieval.
 *
 * `news` adds that many of the closest current-affairs items on top of the k
 * overall matches. Course text usually out-scores a news item on the same
 * topic, and then a question about something recent never met the news at all.
 */
export async function searchChunks(query: string, k = 5, opts: { news?: number } = {}): Promise<FoundChunk[]> {
  if (!aiEnabled()) return [];

  let vector: number[];
  try {
    const [v] = await aiEmbed([query.slice(0, 2000)]);
    if (!v) return [];
    vector = v;
  } catch {
    return []; // embeddings down — caller falls back
  }

  const similarity = sql<number>`1 - (${cosineDistance(contentChunks.embedding, vector)})`;
  const fields = {
    id: contentChunks.id,
    sourceType: contentChunks.sourceType,
    sourceId: contentChunks.sourceId,
    title: contentChunks.title,
    content: contentChunks.content,
    similarity,
  };
  const [overall, news] = await Promise.all([
    db.select(fields).from(contentChunks).orderBy((t) => sql`${t.similarity} DESC`).limit(k),
    opts.news
      ? db
          .select(fields)
          .from(contentChunks)
          .where(eq(contentChunks.sourceType, 'current_affair'))
          .orderBy((t) => sql`${t.similarity} DESC`)
          .limit(opts.news)
      : Promise.resolve([]),
  ]);

  // Drop weak matches — grounding on noise is worse than no grounding
  const seen = new Set<string>();
  const rows = [...overall, ...news].filter((r) => {
    if (Number(r.similarity) < 0.35 || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const newsIds = rows.filter((r) => r.sourceType === 'current_affair').map((r) => r.sourceId);
  const dated = newsIds.length
    ? await db
        .select({ id: currentAffairs.id, publishedAt: currentAffairs.publishedAt })
        .from(currentAffairs)
        .where(inArray(currentAffairs.id, newsIds))
    : [];
  const publishedAt = new Map(dated.map((d) => [d.id, d.publishedAt]));

  return rows.map((r) => ({
    source: r.title,
    text: r.content,
    similarity: Number(r.similarity),
    sourceType: r.sourceType,
    publishedAt: r.sourceType === 'current_affair' ? (publishedAt.get(r.sourceId) ?? null) : null,
  }));
}
