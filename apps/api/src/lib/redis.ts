import IORedis from 'ioredis';
import { logger } from './logger.js';

const isTest = process.env['NODE_ENV'] === 'test';

if (!process.env['REDIS_URL'] && !isTest) {
  throw new Error('REDIS_URL environment variable is required');
}

async function createRedis(): Promise<IORedis> {
  if (isTest) {
    // In-memory Redis — tests run without infrastructure
    const { default: RedisMock } = await import('ioredis-mock');
    return new RedisMock() as unknown as IORedis;
  }
  return new IORedis(process.env['REDIS_URL']!, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

export const redis = await createRedis();

redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
redis.on('connect', () => logger.info('Redis connected'));

export const OTP_TTL = 300; // 5 minutes in seconds
