import { afterAll } from 'vitest';
import { redis } from '../lib/redis.js';

// Env vars (NODE_ENV=test, dummy DATABASE_URL, JWT secrets) are set in
// vitest.config.ts `test.env` — they apply before any module is imported.
// In test mode redis is an in-memory ioredis-mock instance.

afterAll(async () => {
  await redis.quit().catch(() => {});
});
