import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, inject } from './helpers.js';
import {
  parseRssItems,
  resolveCategory,
  scoreExamRelevance,
} from '../modules/current-affairs/current-affairs.service.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('RSS parsing', () => {
  it('extracts items with CDATA and entities', () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title><![CDATA[Cabinet approves &amp; funds new scheme]]></title>
          <link>https://example.com/a</link>
          <description><![CDATA[<p>The Union Cabinet on Thursday approved a major infrastructure scheme worth thousands of crores for rural development.</p>]]></description>
        </item>
        <item>
          <title>Too short</title>
          <link>https://example.com/b</link>
          <description>short</description>
        </item>
      </channel></rss>`;

    const items = parseRssItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Cabinet approves & funds new scheme');
    expect(items[0]!.link).toBe('https://example.com/a');
    expect(items[0]!.description).not.toContain('<p>');
  });

  it('returns empty for malformed xml', () => {
    expect(parseRssItems('not xml at all')).toEqual([]);
  });
});

describe('Current affairs routes', () => {
  it('returns 401 on feed without token', async () => {
    const { status } = await inject(app, 'GET', '/api/v1/current-affairs');
    expect(status).toBe(401);
  });

  it('returns 401 on admin refresh without token', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/admin/current-affairs/refresh');
    expect(status).toBe(401);
  });

  it('rejects bad date format', async () => {
    const { status } = await inject(
      app, 'GET', '/api/v1/current-affairs',
      { query: { date: '03-07-2026' }, token: 'invalid' },
    );
    expect([400, 401]).toContain(status);
  });
});

describe('exam relevance scoring', () => {
  // The old check was /GS[1-4]|prelims|mains/i against the AI's free text,
  // which matched the paper names a dismissal also mentions. In production
  // that put 49 of 50 ingested articles at 0.8 — above the app's 0.7 badge
  // threshold — so local crime reports were shown as "EXAM RELEVANT".
  it('does not score a dismissal as relevant', () => {
    expect(scoreExamRelevance('Not relevant for Prelims; a local law-and-order matter.')).toBeLessThan(0.7);
    expect(scoreExamRelevance('This has limited relevance to the UPSC syllabus.')).toBeLessThan(0.7);
    expect(scoreExamRelevance('No direct relevance for GS Paper 2.')).toBeLessThan(0.7);
    expect(scoreExamRelevance('Unlikely to be asked in Prelims or Mains.')).toBeLessThan(0.7);
  });

  it('still scores a genuine syllabus mapping as relevant', () => {
    expect(scoreExamRelevance('Relevant to GS Paper 2 (Polity) and Prelims.')).toBeGreaterThanOrEqual(0.7);
    expect(scoreExamRelevance('Important for Mains GS3 on conservation.')).toBeGreaterThanOrEqual(0.7);
  });

  it('is neutral on empty or unmapped text', () => {
    expect(scoreExamRelevance('')).toBeLessThan(0.7);
    expect(scoreExamRelevance(null)).toBeLessThan(0.7);
    expect(scoreExamRelevance('A human interest story with no exam angle.')).toBeLessThan(0.7);
  });
});

describe('category resolution', () => {
  // Categories used to be ai.tags[0] verbatim, producing one-of-a-kind chips
  // lifted from headlines ("Girivalam path", "Mayawati", "BJD").
  it('maps real production examples onto the syllabus vocabulary', () => {
    expect(resolveCategory(['Law and Order'], 'Three burglars held for stealing gold ornaments in Vellore'))
      .toBe('Security & Defence');
    expect(resolveCategory(['Article 370'], 'Supreme Court on Article 370 verdict'))
      .toBe('Polity & Governance');
    expect(resolveCategory(['Assam Floods'], 'Assam floods displace thousands')).toBe('Geography');
    expect(resolveCategory(['NEET'], 'NEET counselling schedule released')).toBe('Social Issues & Schemes');
  });

  it('falls back to General rather than inventing a category', () => {
    expect(resolveCategory([], 'Something entirely unclassifiable zzz')).toBe('General');
    expect(resolveCategory(undefined, 'zzz')).toBe('General');
  });
});
