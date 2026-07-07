import { cosineDistance, eq, isNotNull, sql } from 'drizzle-orm';
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

/**
 * Semantic search over indexed content. Returns [] when embeddings are
 * unavailable so callers can fall back to keyword retrieval.
 */
export async function searchChunks(
  query: string,
  k = 5,
): Promise<{ source: string; text: string; similarity: number }[]> {
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
  const rows = await db
    .select({
      title: contentChunks.title,
      content: contentChunks.content,
      similarity,
    })
    .from(contentChunks)
    .orderBy((t) => sql`${t.similarity} DESC`)
    .limit(k);

  // Drop weak matches — grounding on noise is worse than no grounding
  return rows
    .filter((r) => Number(r.similarity) >= 0.35)
    .map((r) => ({ source: r.title, text: r.content, similarity: Number(r.similarity) }));
}
