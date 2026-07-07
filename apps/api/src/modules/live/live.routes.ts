import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import {
  createLiveClassSchema,
  updateLiveClassSchema,
  listLiveClassesSchema,
} from './live.schema.js';
import {
  createLiveClass,
  updateLiveClass,
  deleteLiveClass,
  startLiveClass,
  endLiveClass,
  listLiveClasses,
  getLiveClassAttendance,
  listAvailableLiveClasses,
  joinLiveClass,
} from './live.service.js';

type ZodSchema<T> = {
  safeParse: (v: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { flatten: () => unknown } };
};

function validate<T>(schema: ZodSchema<T>, value: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    void reply.status(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() },
    });
    return null;
  }
  return r.data;
}

export default async function liveRoutes(app: FastifyInstance) {
  // ══ Student ═══════════════════════════════════════════════════════════════

  // List classes for enrolled batches
  app.get('/live-classes', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(listLiveClassesSchema, req.query, reply);
    if (!input) return;
    const result = await listAvailableLiveClasses(req.user.sub, input);
    return reply.send({
      success: true,
      data: result.items,
      meta: { page: input.page, limit: input.limit, total: result.total },
    });
  });

  // Join live class → Agora audience token + attendance record
  app.post('/live-classes/:id/join', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await joinLiveClass(id, req.user.sub);
    return reply.send({ success: true, data: result });
  });

  // ══ Admin / Instructor ════════════════════════════════════════════════════

  app.get(
    '/admin/live-classes',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const input = validate(listLiveClassesSchema, req.query, reply);
      if (!input) return;
      const result = await listLiveClasses(input);
      return reply.send({
        success: true,
        data: result.items,
        meta: { page: input.page, limit: input.limit, total: result.total },
      });
    },
  );

  app.post(
    '/admin/live-classes',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const input = validate(createLiveClassSchema, req.body, reply);
      if (!input) return;
      const cls = await createLiveClass(input);
      return reply.status(201).send({ success: true, data: cls });
    },
  );

  app.patch(
    '/admin/live-classes/:id',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(updateLiveClassSchema, req.body, reply);
      if (!input) return;
      const cls = await updateLiveClass(id, input);
      return reply.send({ success: true, data: cls });
    },
  );

  app.delete(
    '/admin/live-classes/:id',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteLiveClass(id);
      return reply.send({ success: true, data: result });
    },
  );

  // Start → assign Agora channel, return host token
  app.post(
    '/admin/live-classes/:id/start',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await startLiveClass(id, req.user.sub);
      return reply.send({ success: true, data: result });
    },
  );

  // End → stamp isCompleted + endTime
  app.post(
    '/admin/live-classes/:id/end',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const cls = await endLiveClass(id);
      return reply.send({ success: true, data: cls });
    },
  );

  // Attendance report
  app.get(
    '/admin/live-classes/:id/attendance',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const report = await getLiveClassAttendance(id);
      return reply.send({ success: true, data: report });
    },
  );
}
