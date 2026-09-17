import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { logAudit } from '../../lib/audit.js';
import {
  checkoutSchema,
  verifyEnrollRequestSchema,
  rejectEnrollRequestSchema,
} from './enrollment.schema.js';
import { enrolOptions, startCheckout, checkoutStatus } from './checkout.service.js';
import {
  listMyEnrollRequests,
  listCatalogFeePlans,
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
  // ── Catalog pricing (student-facing) ────────────────────────────────────────
  // The staff route /courses/:id/fee-plans is gated on admissions.manage, which
  // students don't have. Pricing is exactly what the marketing catalog is meant
  // to show, so expose the ACTIVE plans of a PUBLISHED course to any signed-in
  // user. Still no syllabus/content — just names and amounts.
  app.get('/catalog/courses/:id/fee-plans', { preHandler: [authenticate] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    return reply.send({ success: true, data: await listCatalogFeePlans(p.id) });
  });

  // ── Student self-serve: in-app bank payment ───────────────────────────────
  const studentsOnly = (req: { user: { role: string } }, reply: FastifyReply) => {
    if (req.user.role !== 'student') {
      void reply.status(403).send({ success: false, error: { code: 'STUDENTS_ONLY', message: 'Only student accounts can self-enrol' } });
      return false;
    }
    return true;
  };

  app.get('/me/enroll/options/:id', { preHandler: [authenticate] }, async (req, reply) => {
    if (!studentsOnly(req, reply)) return;
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    return reply.send({ success: true, data: await enrolOptions(req.user.sub, p.id) });
  });

  app.post('/me/enroll/checkout', { preHandler: [authenticate] }, async (req, reply) => {
    if (!studentsOnly(req, reply)) return;
    const input = validate(checkoutSchema, req.body, reply);
    if (!input) return;
    const result = await startCheckout(req.user.sub, input);
    await logAudit(req, { action: 'enrollment.checkout_started', entityType: 'enrollment_request', entityId: result.requestId, meta: { orderId: result.orderId, amount: result.amount, provider: result.provider } });
    return reply.status(201).send({ success: true, data: result });
  });

  app.get('/me/enroll/checkout/:orderId', { preHandler: [authenticate] }, async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    return reply.send({ success: true, data: await checkoutStatus(req.user.sub, orderId) });
  });

  // The QR-and-reference flow is gone from the app. Builds that still call
  // it get a clear instruction rather than a mystery — 410, not 404, because
  // the endpoint existed and was withdrawn on purpose.
  const withdrawn = async (_req: unknown, reply: FastifyReply) =>
    reply.status(410).send({
      success: false,
      error: { code: 'UPDATE_REQUIRED', message: 'Please update the Inspiro app to enrol. This version is no longer supported.' },
    });
  app.post('/me/enroll', { preHandler: [authenticate] }, withdrawn);
  app.post('/me/enroll/:id/confirm', { preHandler: [authenticate] }, withdrawn);

  app.get('/me/enroll', { preHandler: [authenticate] }, async (req, reply) => {
    return reply.send({ success: true, data: await listMyEnrollRequests(req.user.sub) });
  });

  // ── Staff: verification queue ───────────────────────────────────────────────
  app.get('/admin/enrollment-requests', { preHandler: [authenticate, requirePermission('payments.record')] }, async (req, reply) => {
    const q = req.query as { status?: string; courseId?: string };
    return reply.send({ success: true, data: await listEnrollRequests(q.status, q.courseId) });
  });

  app.post('/admin/enrollment-requests/:id/verify', { preHandler: [authenticate, requirePermission('payments.record')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const input = validate(verifyEnrollRequestSchema, req.body, reply);
    if (!input) return;
    const result = await verifyEnrollRequest(p.id, input, req.user.sub, req.user.role);
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
