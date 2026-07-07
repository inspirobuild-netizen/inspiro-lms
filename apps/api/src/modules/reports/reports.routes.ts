import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { AiUnavailableError } from '../../lib/ai-client.js';
import { BatchNotFoundError, getMonthlyBatchReport } from './reports.service.js';

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

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'),
  refresh: z.coerce.boolean().default(false),
});

export default async function reportsRoutes(app: FastifyInstance) {
  // AI monthly batch report (cached 12h per batch+month)
  app.get(
    '/admin/reports/batches/:id/monthly',
    {
      preHandler: [authenticate, requireRole(['admin'])],
      config: {
        rateLimit: { max: 20, timeWindow: '1 hour', keyGenerator: (req) => `report:${(req as { user?: { sub: string } }).user?.sub ?? req.ip}` },
      },
    },
    async (req, reply) => {
      const params = validate(paramsSchema, req.params, reply);
      if (!params) return;
      const query = validate(querySchema, req.query, reply);
      if (!query) return;
      try {
        const result = await getMonthlyBatchReport(params.id, query.month, { refresh: query.refresh });
        return reply.send({ success: true, data: result });
      } catch (err) {
        if (err instanceof BatchNotFoundError) {
          return reply.status(404).send({ success: false, error: { code: 'BATCH_NOT_FOUND', message: 'Batch not found' } });
        }
        if (err instanceof AiUnavailableError) {
          return reply.status(503).send({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'AI service is not available right now' } });
        }
        throw err;
      }
    },
  );
}
