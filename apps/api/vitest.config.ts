import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // Env defaults so tests run without local infrastructure.
    // Redis is replaced by ioredis-mock in test mode (see src/lib/redis.ts);
    // DATABASE_URL is a dummy — pg only connects on first query.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/inspiro_test',
      REDIS_KEY_PREFIX: 'inspiro:test:',
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars-long',
      COOKIE_SECRET: 'test-cookie-secret-at-least-32-chars-long',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/modules/**/*.ts'],
      exclude: ['src/modules/**/*.routes.ts', 'src/modules/**/*.schema.ts'],
    },
    // Run tests serially — they share a DB
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
