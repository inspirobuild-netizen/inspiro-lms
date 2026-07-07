import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { redis } from '../lib/redis.js';
import { errorHandler } from '../middleware/error-handler.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { global: false, redis });
  await app.register(cookie, { secret: process.env['JWT_SECRET'] ?? 'test-secret-32-chars-minimum-ok' });

  app.setErrorHandler(errorHandler);
  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(import('../modules/auth/auth.routes.js'), { prefix: '/api/v1/auth' });
  await app.register(import('../modules/users/users.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/batches/batches.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/courses/courses.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/exams/exams.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/live/live.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/leaderboard/leaderboard.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/doubts/doubts.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/current-affairs/current-affairs.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/coach/coach.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/reports/reports.routes.js'), { prefix: '/api/v1' });
  await app.register(import('../modules/rag/rag.routes.js'), { prefix: '/api/v1' });

  await app.ready();
  return app;
}

/** Inject a request and return parsed JSON body */
export async function inject<T>(
  app: FastifyInstance,
  method: string,
  url: string,
  opts: { body?: unknown; token?: string; query?: Record<string, string> } = {},
): Promise<{ status: number; body: T }> {
  const qs = opts.query
    ? '?' + new URLSearchParams(opts.query).toString()
    : '';

  const res = await app.inject({
    method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: url + qs,
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    payload: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  return { status: res.statusCode, body: res.json() as T };
}
