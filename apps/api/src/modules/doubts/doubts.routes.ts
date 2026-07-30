import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoleOrPermission } from '../../middleware/require-permission.js';
import {
  answerDoubtSchema,
  assignDoubtSchema,
  createDoubtSchema,
  doubtIdParamSchema,
  listDoubtsSchema,
} from './doubts.schema.js';
import {
  answerDoubt,
  assignDoubt,
  createDoubt,
  ForbiddenError,
  getDoubt,
  listAllDoubts,
  listMyDoubts,
  NotFoundError,
} from './doubts.service.js';
import { logAudit } from '../../lib/audit.js';

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

export default async function doubtsRoutes(app: FastifyInstance) {
  // Student: ask a doubt (AI answers synchronously or escalates)
  app.post(
    '/doubts',
    {
      preHandler: [authenticate],
      config: {
        // LLM calls are expensive — cap per-user throughput
        rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: (req) => `doubts:${(req as { user?: { sub: string } }).user?.sub ?? req.ip}` },
      },
    },
    async (req, reply) => {
      const input = validate(createDoubtSchema, req.body, reply);
      if (!input) return;
      const doubt = await createDoubt(req.user.sub, input);
      return reply.status(201).send({ success: true, data: doubt });
    },
  );

  // Student: my doubts
  app.get('/doubts', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(listDoubtsSchema, req.query, reply);
    if (!input) return;
    const result = await listMyDoubts(req.user.sub, input);
    return reply.send({
      success: true,
      data: result.items,
      meta: { page: input.page, limit: input.limit, total: result.total },
    });
  });

  // Single doubt (owner, or any staff)
  app.get('/doubts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const params = validate(doubtIdParamSchema, req.params, reply);
    if (!params) return;
    try {
      const doubt = await getDoubt(params.id, req.user.sub, req.user.role);
      return reply.send({ success: true, data: doubt });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Doubt not found' } });
      }
      if (err instanceof ForbiddenError) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your doubt' } });
      }
      throw err;
    }
  });

  // Staff: escalation queue / all doubts
  app.get(
    '/admin/doubts',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'doubts.view')] },
    async (req, reply) => {
      const input = validate(listDoubtsSchema, req.query, reply);
      if (!input) return;
      const result = await listAllDoubts(input);
      return reply.send({
        success: true,
        data: result.items,
        meta: { page: input.page, limit: input.limit, total: result.total },
      });
    },
  );

  // Staff: answer a doubt (resolves it and notifies the student)
  app.post(
    '/admin/doubts/:id/answer',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'doubts.manage')] },
    async (req, reply) => {
      const params = validate(doubtIdParamSchema, req.params, reply);
      if (!params) return;
      const input = validate(answerDoubtSchema, req.body, reply);
      if (!input) return;
      try {
        const doubt = await answerDoubt(params.id, req.user.sub, input);
        return reply.send({ success: true, data: doubt });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Doubt not found' } });
        }
        throw err;
      }
    },
  );

  // Staff: pre-assign an open/escalated doubt to a mentor before it's answered
  app.patch(
    '/admin/doubts/:id/assign',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'doubts.manage')] },
    async (req, reply) => {
      const params = validate(doubtIdParamSchema, req.params, reply);
      if (!params) return;
      const input = validate(assignDoubtSchema, req.body, reply);
      if (!input) return;
      try {
        const doubt = await assignDoubt(params.id, input);
        await logAudit(req, { action: 'doubt.assigned', entityType: 'doubt', entityId: params.id, meta: { assignedTo: input.assignedTo } });
        return reply.send({ success: true, data: doubt });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Doubt not found' } });
        }
        throw err;
      }
    },
  );
}
