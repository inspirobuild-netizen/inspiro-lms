import 'dotenv/config';
import './lib/env-check.js'; // validates env at import time — must stay 2nd
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import { redis } from './lib/redis.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';

const app = Fastify({
  logger,
  trustProxy: true,
});

// ── Plugins ──────────────────────────────────────────────────────────────────
await app.register(cors, {
  origin: process.env['NODE_ENV'] === 'production'
    ? (process.env['CORS_ORIGIN'] ?? 'https://admin.inspiroiasacademy.in').split(',').map((s) => s.trim())
    : true,
  credentials: true,
});

await app.register(rateLimit, {
  global: false, // apply per-route via config
  redis,
});

await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

await app.register(cookie, {
  secret: process.env['JWT_SECRET'] ?? '',
});

// ── Error handling ────────────────────────────────────────────────────────────
app.setErrorHandler(errorHandler);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ── API Routes ────────────────────────────────────────────────────────────────
await app.register(import('./modules/auth/auth.routes.js'), { prefix: '/api/v1/auth' });
await app.register(import('./modules/users/users.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/batches/batches.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/courses/courses.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/media/media.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/exams/exams.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/live/live.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/notifications/notifications.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/leaderboard/leaderboard.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/analytics/analytics.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/doubts/doubts.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/current-affairs/current-affairs.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/coach/coach.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/reports/reports.routes.js'), { prefix: '/api/v1' });
await app.register(import('./modules/rag/rag.routes.js'), { prefix: '/api/v1' });

// ── Cron jobs ─────────────────────────────────────────────────────────────────
if (process.env['NODE_ENV'] !== 'test') {
  const cron = await import('node-cron');
  const { ingestCurrentAffairs } = await import('./modules/current-affairs/current-affairs.service.js');
  // Daily current-affairs digest at 6 AM IST
  cron.schedule(
    '0 6 * * *',
    () => {
      ingestCurrentAffairs().catch((err) =>
        logger.error({ err }, 'Scheduled current-affairs ingestion failed'),
      );
    },
    { timezone: 'Asia/Kolkata' },
  );
}

// ── Start ─────────────────────────────────────────────────────────────────────
try {
  await redis.connect();
  await app.listen({
    port: Number(process.env['PORT'] ?? 3000),
    host: process.env['HOST'] ?? '0.0.0.0',
  });
} catch (err) {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
}
