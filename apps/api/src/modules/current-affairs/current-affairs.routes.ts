import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { requirePermission } from '../../middleware/require-permission.js';
import {
  deleteCurrentAffair,
  getContentCoverage,
  ingestCurrentAffairs,
  listCurrentAffairs,
  updateCurrentAffair,
} from './current-affairs.service.js';

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

const updateSchema = z.object({
  title: z.string().min(3).max(500).optional(),
  summary: z.string().min(10).optional(),
  category: z.string().min(1).max(50).optional(),
  sourceUrl: z.string().url().nullable().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

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

  // Admin: browse/curate (same query shape as the student feed)
  app.get('/admin/current-affairs', { preHandler: [authenticate, requirePermission('content.manage')] }, async (req, reply) => {
    const input = validate(listSchema, req.query, reply);
    if (!input) return;
    const result = await listCurrentAffairs(input);
    return reply.send({
      success: true,
      data: result.items,
      meta: { page: input.page, limit: input.limit, total: result.total },
    });
  });

  app.patch('/admin/current-affairs/:id', { preHandler: [authenticate, requirePermission('content.manage')] }, async (req, reply) => {
    const params = validate(idParamSchema, req.params, reply);
    if (!params) return;
    const input = validate(updateSchema, req.body, reply);
    if (!input) return;
    const item = await updateCurrentAffair(params.id, input);
    return reply.send({ success: true, data: item });
  });

  app.delete('/admin/current-affairs/:id', { preHandler: [authenticate, requirePermission('content.manage')] }, async (req, reply) => {
    const params = validate(idParamSchema, req.params, reply);
    if (!params) return;
    const result = await deleteCurrentAffair(params.id);
    return reply.send({ success: true, data: result });
  });

  // Admin: RAG coverage — which courses/current-affairs are indexed
  app.get('/admin/content/coverage', { preHandler: [authenticate, requirePermission('content.manage')] }, async (_req, reply) => {
    return reply.send({ success: true, data: await getContentCoverage() });
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
