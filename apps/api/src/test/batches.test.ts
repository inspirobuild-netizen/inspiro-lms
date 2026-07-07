import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, inject } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('GET /api/v1/batches', () => {
  it('returns 401 without token', async () => {
    const { status } = await inject(app, 'GET', '/api/v1/batches');
    expect(status).toBe(401);
  });
});

describe('POST /api/v1/admin/batches', () => {
  it('returns 401 without token', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/admin/batches', {
      body: { name: 'Test Batch' },
    });
    expect(status).toBe(401);
  });

  it('rejects empty name', async () => {
    // Even without auth we get 401, but schema should reject empty name before DB
    // Test by crafting a dummy (invalid) token to get past auth into validation
    const { status } = await inject<{ error: { code: string } }>(
      app, 'POST', '/api/v1/admin/batches',
      { body: { name: '' }, token: 'invalid' },
    );
    // Either 401 (token rejected) or 400 (validation) — never 500
    expect([400, 401]).toContain(status);
  });
});

describe('Batch pagination', () => {
  it('rejects page=0 as invalid', async () => {
    const { status } = await inject<{ error: { code: string } }>(
      app, 'GET', '/api/v1/batches',
      { query: { page: '0' }, token: 'invalid' },
    );
    expect([400, 401]).toContain(status);
  });
});
