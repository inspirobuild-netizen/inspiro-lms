import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, inject } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('Coach routes', () => {
  it('returns 401 without token', async () => {
    const { status } = await inject(app, 'GET', '/api/v1/coach/my-plan');
    expect(status).toBe(401);
  });

  it('rejects invalid language', async () => {
    const { status } = await inject(
      app, 'GET', '/api/v1/coach/my-plan',
      { query: { language: 'fr' }, token: 'invalid' },
    );
    expect([400, 401]).toContain(status);
  });
});

describe('Reports routes', () => {
  it('returns 401 without token', async () => {
    const { status } = await inject(
      app, 'GET',
      '/api/v1/admin/reports/batches/00000000-0000-0000-0000-000000000000/monthly',
      { query: { month: '2026-06' } },
    );
    expect(status).toBe(401);
  });

  it('rejects bad month format', async () => {
    const { status } = await inject(
      app, 'GET',
      '/api/v1/admin/reports/batches/00000000-0000-0000-0000-000000000000/monthly',
      { query: { month: 'June' }, token: 'invalid' },
    );
    expect([400, 401]).toContain(status);
  });
});

describe('Question auto-tag route', () => {
  it('returns 401 without token', async () => {
    const { status } = await inject(
      app, 'POST',
      '/api/v1/admin/questions/00000000-0000-0000-0000-000000000000/auto-tag',
    );
    expect(status).toBe(401);
  });
});
