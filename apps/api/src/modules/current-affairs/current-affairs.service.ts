import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { contentChunks, courses, currentAffairs } from '../../../drizzle/schema.js';
import { aiEnabled, aiSummarizeArticle } from '../../lib/ai-client.js';
import { embedChunk } from '../rag/rag.service.js';
import { logger } from '../../lib/logger.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

const DEFAULT_FEEDS = [
  'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', // PIB press releases
  'https://www.thehindu.com/news/national/feeder/default.rss',
];

const MAX_ARTICLES_PER_RUN = 10;

interface FeedItem {
  title: string;
  link: string;
  description: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '') // strip any residual HTML tags
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minimal RSS 2.0 <item> extractor — avoids an XML parser dependency. */
export function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const link = block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] ?? '';
    const description = block.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] ?? '';
    const cleanTitle = decodeEntities(title);
    const cleanDesc = decodeEntities(description);
    if (cleanTitle && cleanDesc.length >= 50) {
      items.push({ title: cleanTitle, link: decodeEntities(link), description: cleanDesc });
    }
  }
  return items;
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'InspiroLMS/1.0 (+https://inspiro.example)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'RSS feed returned error');
      return [];
    }
    return parseRssItems(await res.text());
  } catch (err) {
    logger.warn({ err, url }, 'RSS feed fetch failed');
    return [];
  }
}

/**
 * Daily ingestion: fetch RSS feeds, AI-summarize new articles, store with
 * a quiz question. Skips articles already ingested (title match, last 7 days).
 */
export async function ingestCurrentAffairs(): Promise<{ ingested: number; skipped: number }> {
  if (!aiEnabled()) {
    logger.warn('Current-affairs ingestion skipped — AI service not configured');
    return { ingested: 0, skipped: 0 };
  }

  const feedUrls = (process.env['CA_RSS_FEEDS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const feeds = feedUrls.length ? feedUrls : DEFAULT_FEEDS;

  const results = await Promise.all(feeds.map(fetchFeed));
  const items = results.flat();

  // Dedupe against the last 7 days by exact title
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const recent = await db
    .select({ title: currentAffairs.title })
    .from(currentAffairs)
    .where(gte(currentAffairs.publishedAt, weekAgo));
  const seen = new Set(recent.map((r) => r.title));

  let ingested = 0;
  let skipped = 0;

  for (const item of items) {
    if (ingested >= MAX_ARTICLES_PER_RUN) break;
    const title = item.title.slice(0, 500);
    if (seen.has(title)) {
      skipped++;
      continue;
    }

    try {
      const ai = await aiSummarizeArticle({
        title: item.title,
        body: item.description.slice(0, 20_000),
        generate_mcqs: true,
      });

      const mcq = ai.mcqs[0];
      const [inserted] = await db.insert(currentAffairs).values({
        title,
        summary: ai.summary,
        category: ai.tags[0]?.slice(0, 50) ?? 'general',
        sourceUrl: item.link || null,
        // Rough relevance signal from whether the AI mapped it to a GS paper
        upscRelevance: /GS[1-4]|prelims|mains/i.test(ai.exam_relevance) ? 0.8 : 0.4,
        quizQuestion: mcq?.question ?? null,
        quizOptions: mcq?.options ?? null,
        quizCorrectIndex: mcq?.correct_index ?? null,
      }).returning({ id: currentAffairs.id });
      seen.add(title);
      ingested++;

      // Make it findable by the doubt resolver immediately (best-effort)
      if (inserted) {
        await embedChunk({
          sourceType: 'current_affair',
          sourceId: inserted.id,
          title,
          content: ai.summary,
        });
      }
    } catch (err) {
      logger.error({ err, title }, 'Failed to summarize article');
      skipped++;
    }
  }

  logger.info({ ingested, skipped }, 'Current-affairs ingestion complete');
  return { ingested, skipped };
}

export async function listCurrentAffairs(input: {
  page: number;
  limit: number;
  category?: string;
  date?: string; // YYYY-MM-DD
}) {
  const conditions = [];
  if (input.category) conditions.push(eq(currentAffairs.category, input.category));
  if (input.date) {
    conditions.push(sql`${currentAffairs.publishedAt}::date = ${input.date}::date`);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(currentAffairs)
      .where(where)
      .orderBy(desc(currentAffairs.publishedAt))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ value: count() }).from(currentAffairs).where(where),
  ]);

  return { items, total: total?.value ?? 0 };
}

export async function updateCurrentAffair(id: string, data: Partial<{
  title: string; summary: string; category: string; sourceUrl: string | null;
}>) {
  const [updated] = await db.update(currentAffairs).set(data).where(eq(currentAffairs.id, id)).returning();
  if (!updated) throw err('Current-affairs item not found', 404, 'CURRENT_AFFAIR_NOT_FOUND');
  return updated;
}

export async function deleteCurrentAffair(id: string) {
  const result = await db.delete(currentAffairs).where(eq(currentAffairs.id, id)).returning();
  if (result.length === 0) throw err('Current-affairs item not found', 404, 'CURRENT_AFFAIR_NOT_FOUND');
  return { deleted: true };
}

/** RAG coverage: which courses have an indexed content chunk, and how much current-affairs content is indexed. */
export async function getContentCoverage() {
  const courseRows = await db.select({ id: courses.id, title: courses.title }).from(courses);
  const chunkedCourseIds = await db
    .select({ sourceId: contentChunks.sourceId })
    .from(contentChunks)
    .where(and(eq(contentChunks.sourceType, 'course'), inArray(contentChunks.sourceId, courseRows.map((c) => c.id))));
  const chunked = new Set(chunkedCourseIds.map((c) => c.sourceId));

  const [{ value: totalCurrentAffairs }] = await db.select({ value: count() }).from(currentAffairs);
  const [{ value: chunkedCurrentAffairs }] = await db
    .select({ value: count() })
    .from(contentChunks)
    .where(eq(contentChunks.sourceType, 'current_affair'));

  return {
    courses: courseRows.map((c) => ({ id: c.id, title: c.title, hasContentChunk: chunked.has(c.id) })),
    currentAffairs: { total: totalCurrentAffairs, indexed: chunkedCurrentAffairs },
  };
}
