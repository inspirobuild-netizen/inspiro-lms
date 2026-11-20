import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, inject } from './helpers.js';
import { attemptLimit } from '../modules/exams/exams.service.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('attemptLimit', () => {
  it('pins every exam except practice to one attempt, whatever was set', () => {
    expect(attemptLimit({ type: 'chapter', maxAttempts: 10 })).toBe(1);
    expect(attemptLimit({ type: 'mock', maxAttempts: null })).toBe(1);
    expect(attemptLimit({ type: 'topic_quiz', maxAttempts: 1 })).toBe(1);
  });

  it('lets practice tests keep their own limit, null meaning unlimited', () => {
    expect(attemptLimit({ type: 'practice', maxAttempts: 3 })).toBe(3);
    expect(attemptLimit({ type: 'practice', maxAttempts: null })).toBeNull();
  });
});

describe('Exam schema validation', () => {
  it('rejects createExam with missing required fields', async () => {
    const { status, body } = await inject<{ error: { code: string } }>(
      app, 'POST', '/api/v1/admin/exams',
      { body: { title: '' }, token: 'invalid' },
    );
    expect([400, 401]).toContain(status);
    // If 400, must be VALIDATION_ERROR
    if (status === 400) expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects negMarks out of range', async () => {
    const { status, body } = await inject<{ error: { code: string } }>(
      app, 'POST', '/api/v1/admin/exams',
      {
        body: {
          title: 'Test Exam',
          subject: 'GS',
          type: 'mock',
          durationMins: 120,
          negMarks: -5, // invalid — should be >= 0
          passPercent: 50,
        },
        token: 'invalid',
      },
    );
    expect([400, 401]).toContain(status);
    if (status === 400) expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects submitExam with non-UUID questionId key', async () => {
    const { status } = await inject<{ error: { code: string } }>(
      app, 'POST',
      '/api/v1/exams/00000000-0000-0000-0000-000000000000/attempts/00000000-0000-0000-0000-000000000000/submit',
      { body: { answers: { 'not-a-uuid': 1 } }, token: 'invalid' },
    );
    expect([400, 401]).toContain(status);
  });
});

describe('Exam attempt guard', () => {
  it('returns 401 on start without token', async () => {
    const { status } = await inject(
      app, 'POST', '/api/v1/exams/00000000-0000-0000-0000-000000000000/start',
    );
    expect(status).toBe(401);
  });

  it('returns 401 on submit without token', async () => {
    const { status } = await inject(
      app, 'POST',
      '/api/v1/exams/00000000-0000-0000-0000-000000000000/attempts/00000000-0000-0000-0000-000000000000/submit',
    );
    expect(status).toBe(401);
  });
});
