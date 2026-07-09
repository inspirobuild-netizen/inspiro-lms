import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, inject } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('GET /health', () => {
  it('returns ok', async () => {
    const { status, body } = await inject<{ status: string }>(app, 'GET', '/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });
});

describe('POST /api/v1/auth/send-otp', () => {
  it('rejects missing phone', async () => {
    const { status, body } = await inject<{ success: boolean; error: { code: string } }>(
      app, 'POST', '/api/v1/auth/send-otp', { body: {} },
    );
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects invalid phone format', async () => {
    const { status, body } = await inject<{ success: boolean; error: { code: string } }>(
      app, 'POST', '/api/v1/auth/send-otp', { body: { phone: '123' } },
    );
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a correctly formatted phone', async () => {
    // Schema requires +91XXXXXXXXXX. Without Twilio configured the send may
    // fail downstream, but it must pass validation (never 400).
    const { status } = await inject<{ success: boolean }>(
      app, 'POST', '/api/v1/auth/send-otp', { body: { phone: '+919876543210' } },
    );
    expect(status).not.toBe(400);
  });
});

describe('POST /api/v1/auth/verify-otp', () => {
  it('rejects wrong OTP', async () => {
    const { status, body } = await inject<{ success: boolean; error: { code: string } }>(
      app, 'POST', '/api/v1/auth/verify-otp',
      { body: { phone: '+919876543210', otp: '000000' } },
    );
    expect([400, 401]).toContain(status);
    expect(body.success).toBe(false);
  });

  it('rejects short OTP', async () => {
    const { status, body } = await inject<{ success: boolean; error: { code: string } }>(
      app, 'POST', '/api/v1/auth/verify-otp',
      { body: { phone: '+919876543210', otp: '12' } },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('rejects invalid email format', async () => {
    const { status, body } = await inject<{ success: boolean; error: { code: string } }>(
      app, 'POST', '/api/v1/auth/login',
      { body: { email: 'not-an-email', password: 'longenough123' } },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects short password', async () => {
    const { status, body } = await inject<{ success: boolean; error: { code: string } }>(
      app, 'POST', '/api/v1/auth/login',
      { body: { email: 'admin@inspiroiasacademy.in', password: 'short' } },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing body fields', async () => {
    const { status } = await inject(app, 'POST', '/api/v1/auth/login', { body: {} });
    expect(status).toBe(400);
  });
});

describe('Password hashing', () => {
  it('hashes and verifies round-trip; rejects wrong password', async () => {
    const { hashPassword, verifyPassword } = await import('../lib/password.js');
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt:')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
    expect(await verifyPassword('anything', 'garbage-stored-value')).toBe(false);
  });
});

describe('Auth guard', () => {
  it('returns 401 on protected route without token', async () => {
    const { status, body } = await inject<{ success: boolean; error: { code: string } }>(
      app, 'GET', '/api/v1/admin/users',
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe('MISSING_TOKEN');
  });

  it('returns 401 with a garbage token', async () => {
    const { status, body } = await inject<{ success: boolean; error: { code: string } }>(
      app, 'GET', '/api/v1/admin/users', { token: 'not.a.jwt' },
    );
    expect(status).toBe(401);
    expect(body.error.code).toBe('INVALID_TOKEN');
  });
});
