import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, inject } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('RAG routes', () => {
  it('returns 401 on reindex without token', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/admin/rag/reindex');
    expect(status).toBe(401);
  });
});

describe('searchChunks fallback', () => {
  it('returns [] when AI service is not configured', async () => {
    // AI_SERVICE_URL/AI_INTERNAL_KEY are unset in tests — semantic search
    // must silently no-op so doubt grounding falls back to keywords.
    const { searchChunks } = await import('../modules/rag/rag.service.js');
    const result = await searchChunks('What is Article 14?');
    expect(result).toEqual([]);
  });
});
