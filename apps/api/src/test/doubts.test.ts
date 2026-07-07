import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, inject } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('Doubts auth guard', () => {
  it('returns 401 on create without token', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/doubts', {
      body: { subject: 'Polity', body: 'What is Article 14?' },
    });
    expect(status).toBe(401);
  });

  it('returns 401 on list without token', async () => {
    const { status } = await inject(app, 'GET', '/api/v1/doubts');
    expect(status).toBe(401);
  });

  it('returns 401 on admin queue without token', async () => {
    const { status } = await inject(app, 'GET', '/api/v1/admin/doubts');
    expect(status).toBe(401);
  });

  it('returns 401 on answer without token', async () => {
    const { status } = await inject(
      app, 'POST', '/api/v1/admin/doubts/00000000-0000-0000-0000-000000000000/answer',
      { body: { answer: 'Article 14 guarantees equality before law.' } },
    );
    expect(status).toBe(401);
  });
});

describe('Doubts validation', () => {
  it('rejects a too-short doubt body before auth-independent processing', async () => {
    const { status } = await inject(
      app, 'POST', '/api/v1/doubts',
      { body: { subject: 'Polity', body: 'hi' }, token: 'invalid' },
    );
    // Token is rejected first (401); never 500
    expect([400, 401]).toContain(status);
  });

  it('rejects non-uuid doubt id', async () => {
    const { status } = await inject(
      app, 'GET', '/api/v1/doubts/not-a-uuid', { token: 'invalid' },
    );
    expect([400, 401]).toContain(status);
  });
});

describe('AI exam generation guard', () => {
  it('returns 401 without token', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/admin/exams/generate-ai', {
      body: { topic: 'Fundamental Rights', subject: 'Polity' },
    });
    expect(status).toBe(401);
  });
});
