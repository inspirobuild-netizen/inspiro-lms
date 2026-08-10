import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { contentChunks, courses, currentAffairs } from '../../../drizzle/schema.js';
import { aiEnabled, aiSummarizeArticle } from '../../lib/ai-client.js';
import { embedChunk } from '../rag/rag.service.js';
import { logger } from '../../lib/logger.js';

function err(msg: string, statusCode: number, code: string) {
  return Object.assign(new Error(msg), { statusCode, code });
}

// Overridden by CA_RSS_FEEDS. Sections chosen so the digest maps onto the
// syllabus rather than the news cycle: editorials for GS2, business for GS3
// economy, sci-tech for GS3 S&T. The national feed used to sit here and is why
// the digest filled with local crime reports — it is deliberately absent.
//
// PIB would be the ideal source but its RSS carries only <title> and <link>
// with no article text, so there is nothing to summarise; using it needs a
// fetch of each press-release page. Indian Express returns 403 to the server's
// IP even with a browser agent.
const DEFAULT_FEEDS = [
  'https://www.thehindu.com/opinion/feeder/default.rss',
  'https://www.thehindu.com/business/feeder/default.rss',
  'https://www.thehindu.com/sci-tech/feeder/default.rss',
];

const MAX_ARTICLES_PER_RUN = 10;

/// The AI service returns `exam_relevance` as free text, so this is a
/// heuristic over prose rather than a real score — but the previous check,
/// `/GS[1-4]|prelims|mains/i.test(...)`, matched the paper names an LLM
/// mentions *either way*. "Not relevant for Prelims" scored 0.8, so 49 of 50
/// ingested articles came out at 0.8 and every one earned the app's "EXAM
/// RELEVANT" star — local burglary reports included. Dismissive phrasing is
/// now checked first. It deliberately errs toward under-starring: telling a
/// student that a crime report matters for their exam is worse than staying
/// quiet about a borderline one.
export function scoreExamRelevance(text: string | null | undefined): number {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return 0.4;
  const dismissive =
    /\b(not|no|little|limited|minimal|low|unlikely|marginal|tangential|peripheral)\b[^.]{0,40}\b(relevan|direct|importan|significan|useful|bearing|ask|feature|appear|examinab)/;
  if (dismissive.test(t)) return 0.3;
  const positive = /\b(gs\s*-?\s*[1-4]|general studies paper|prelims|mains|syllabus)\b/;
  return positive.test(t) ? 0.8 : 0.4;
}

/// Categories used to come from `ai.tags[0]` verbatim, which is why proper
/// nouns lifted straight out of headlines — "Girivalam path", "Mayawati",
/// "BJD", "Kunbi caste" — were rendering as category chips. Free text gives
/// a one-of-a-kind category per article, so the chip can never be filtered
/// on. Map onto a fixed syllabus vocabulary instead.
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/polit|constitut|parliament|judicial|judiciar|court|governance|article\s*\d|amendment|election/, 'Polity & Governance'],
  [/econom|gdp|inflation|budget|tax|trade|bank|rbi|fiscal|invest|industr|export/, 'Economy'],
  [/environment|climate|wildlife|forest|pollution|biodivers|ecolog|conservation|emission/, 'Environment & Ecology'],
  [/scien|technolog|space|isro|research|digital|semiconductor|health|vaccine|disease|medic/, 'Science & Technology'],
  [/internationa|foreign|diplomat|bilateral|treaty|summit|united nations|border|geopolit/, 'International Relations'],
  [/histor|heritage|culture|temple|archaeolog|monument|festival|art\b|literature/, 'Art, Culture & History'],
  [/geograph|monsoon|flood|cyclone|earthquake|river|dam|mineral|rainfall|drought/, 'Geography'],
  [/scheme|welfare|social|education|women|tribal|caste|poverty|census|employment|rural|neet|counselling|university|college|school/, 'Social Issues & Schemes'],
  [/defence|defense|militar|army|navy|air force|security|terror|police|crime|smuggl|traffick|law and order|arrest|burglar|theft|steal|robber|murder|assault|seiz/, 'Security & Defence'],
];

export function resolveCategory(tags: string[] | undefined, title: string): string {
  // Title included because tags are often a single proper noun that matches
  // nothing, while the headline carries the actual subject.
  const haystack = [...(tags ?? []), title].join(' ').toLowerCase();
  for (const [pattern, label] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return label;
  }
  return 'General';
}

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
    let cleanDesc = decodeEntities(description);
    // WordPress-style feeds (Indian Express Explained among them) put a
    // 12-character teaser in <description> and the actual article body in
    // <content:encoded>. Reading only <description> dropped every one of
    // their items against the 50-char floor below.
    if (cleanDesc.length < 50) {
      const encoded = block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/)?.[1] ?? '';
      const cleanEncoded = decodeEntities(encoded);
      if (cleanEncoded.length > cleanDesc.length) cleanDesc = cleanEncoded;
    }
    if (cleanTitle && cleanDesc.length >= 50) {
      items.push({ title: cleanTitle, link: decodeEntities(link), description: cleanDesc });
    }
  }
  return items;
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(url, {
      // PIB — the most exam-relevant source we have — returns 403 to a custom
      // agent string and 200 to a browser one, so the government feed had
      // silently produced nothing and every article came from the news feed
      // alongside it. These are public RSS endpoints; a conventional agent is
      // what they expect.
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
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
        category: resolveCategory(ai.tags, title),
        sourceUrl: item.link || null,
        upscRelevance: scoreExamRelevance(ai.exam_relevance),
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
