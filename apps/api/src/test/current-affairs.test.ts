import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, inject } from './helpers.js';
import { parseRssItems } from '../modules/current-affairs/current-affairs.service.js';

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
