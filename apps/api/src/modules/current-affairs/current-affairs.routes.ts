import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { ingestCurrentAffairs, listCurrentAffairs } from './current-affairs.service.js';

type ZodSchema<T> = {
  safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } };
};
function validate<T>(schema: ZodSchema<T>, value: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    void reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() } });
    return null;
  }
  return r.data;
}

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().max(50).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export default async function currentAffairsRoutes(app: FastifyInstance) {
  // Student feed
  app.get('/current-affairs', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(listSchema, req.query, reply);
    if (!input) return;
    const result = await listCurrentAffairs(input);
    return reply.send({
      success: true,
      data: result.items,
      meta: { page: input.page, limit: input.limit, total: result.total },
    });
  });

  // Admin: manual ingestion trigger (cron runs it daily at 6 AM)
  app.post(
    '/admin/current-affairs/refresh',
    {
      preHandler: [authenticate, requireRole(['admin'])],
      config: { rateLimit: { max: 4, timeWindow: '1 hour' } },
    },
    async (_req, reply) => {
      const result = await ingestCurrentAffairs();
      return reply.send({ success: true, data: result });
    },
  );
}
