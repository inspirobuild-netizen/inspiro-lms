import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { logAudit } from '../../lib/audit.js';
import {
  createEnrollRequestSchema,
  confirmEnrollRequestSchema,
  verifyEnrollRequestSchema,
  rejectEnrollRequestSchema,
} from './enrollment.schema.js';
import {
  createEnrollRequest,
  confirmEnrollRequest,
  listMyEnrollRequests,
  listEnrollRequests,
  verifyEnrollRequest,
  rejectEnrollRequest,
} from './enrollment.service.js';

type ZodSchema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } };
function validate<T>(schema: ZodSchema<T>, value: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    void reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() } });
    return null;
  }
  return r.data;
}

const idParam = z.object({ id: z.string().uuid() });

export default async function enrollmentRoutes(app: FastifyInstance) {
  // ── Student self-serve: browse-to-pay flow ──────────────────────────────────
  app.post('/me/enroll', { preHandler: [authenticate] }, async (req, reply) => {
    if (req.user.role !== 'student') {
      return reply.status(403).send({ success: false, error: { code: 'STUDENTS_ONLY', message: 'Only student accounts can self-enrol' } });
    }
    const input = validate(createEnrollRequestSchema, req.body, reply);
    if (!input) return;
    const result = await createEnrollRequest(req.user.sub, input);
    return reply.status(201).send({ success: true, data: result });
  });

  app.post('/me/enroll/:id/confirm', { preHandler: [authenticate] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const input = validate(confirmEnrollRequestSchema, req.body, reply);
    if (!input) return;
    const result = await confirmEnrollRequest(req.user.sub, p.id, input);
    return reply.send({ success: true, data: result });
  });

  app.get('/me/enroll', { preHandler: [authenticate] }, async (req, reply) => {
    return reply.send({ success: true, data: await listMyEnrollRequests(req.user.sub) });
  });

  // ── Staff: verification queue ───────────────────────────────────────────────
  app.get('/admin/enrollment-requests', { preHandler: [authenticate, requirePermission('payments.record')] }, async (req, reply) => {
    const status = (req.query as { status?: string }).status;
    return reply.send({ success: true, data: await listEnrollRequests(status) });
  });

  app.post('/admin/enrollment-requests/:id/verify', { preHandler: [authenticate, requirePermission('payments.record')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const input = validate(verifyEnrollRequestSchema, req.body, reply);
    if (!input) return;
    const result = await verifyEnrollRequest(p.id, input, req.user.sub);
    await logAudit(req, {
      action: 'enrollment_request.verified',
      entityType: 'enrollment_request',
      entityId: p.id,
      meta: { admissionNo: result.admissionNo, studentId: result.studentId },
    });
    return reply.send({ success: true, data: result });
  });

  app.post('/admin/enrollment-requests/:id/reject', { preHandler: [authenticate, requirePermission('payments.record')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const input = validate(rejectEnrollRequestSchema, req.body, reply);
    if (!input) return;
    const result = await rejectEnrollRequest(p.id, input.reason, req.user.sub);
    await logAudit(req, { action: 'enrollment_request.rejected', entityType: 'enrollment_request', entityId: p.id });
    return reply.send({ success: true, data: result });
  });
}
