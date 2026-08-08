import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { logAudit } from '../../lib/audit.js';
import {
  createFeePlanSchema,
  feesOverviewQuerySchema,
  recordPaymentSchema,
  setCourseFeeSchema,
  updateFeePlanSchema,
} from './fees.schema.js';
import {
  buildUpiRequest,
  createFeePlan,
  deleteFeePlan,
  getFeesOverview,
  getOutstandingInstallments,
  listFeePlans,
  listInstallments,
  listPayments,
  recordPayment,
  setCourseFee,
  updateFeePlan,
} from './fees.service.js';

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

const idParam = z.object({ id: z.string().uuid() });
const courseIdParam = z.object({ courseId: z.string().uuid() });
const outstandingQuerySchema = feesOverviewQuerySchema.extend({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function feesRoutes(app: FastifyInstance) {
  // ── Fee plan configuration (admin / finance) ────────────────────────────────
  app.get('/admin/courses/:courseId/fee-plans', { preHandler: [authenticate, requirePermission('fees.configure')] }, async (req, reply) => {
    const p = validate(courseIdParam, req.params, reply);
    if (!p) return;
    return reply.send({ success: true, data: await listFeePlans(p.courseId) });
  });

  app.post('/admin/courses/:courseId/fee-plans', { preHandler: [authenticate, requirePermission('fees.configure')] }, async (req, reply) => {
    const p = validate(courseIdParam, req.params, reply);
    if (!p) return;
    const input = validate(createFeePlanSchema, req.body, reply);
    if (!input) return;
    const plan = await createFeePlan(p.courseId, input);
    await logAudit(req, { action: 'fee_plan.created', entityType: 'fee_plan', entityId: plan.id, meta: { courseId: p.courseId, name: plan.name } });
    return reply.status(201).send({ success: true, data: plan });
  });

  app.patch('/admin/fee-plans/:id', { preHandler: [authenticate, requirePermission('fees.configure')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const input = validate(updateFeePlanSchema, req.body, reply);
    if (!input) return;
    const plan = await updateFeePlan(p.id, input);
    await logAudit(req, { action: 'fee_plan.updated', entityType: 'fee_plan', entityId: p.id });
    return reply.send({ success: true, data: plan });
  });

  app.delete('/admin/fee-plans/:id', { preHandler: [authenticate, requirePermission('fees.configure')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const result = await deleteFeePlan(p.id);
    await logAudit(req, { action: 'fee_plan.deleted', entityType: 'fee_plan', entityId: p.id });
    return reply.send({ success: true, data: result });
  });

  app.patch('/admin/courses/:id/fee', { preHandler: [authenticate, requirePermission('fees.configure')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const input = validate(setCourseFeeSchema, req.body, reply);
    if (!input) return;
    const course = await setCourseFee(p.id, input.feeAmount);
    await logAudit(req, { action: 'course.fee_set', entityType: 'course', entityId: p.id, meta: { feeAmount: input.feeAmount } });
    return reply.send({ success: true, data: course });
  });

  // ── Plans a counsellor can pick from at conversion time ─────────────────────
  app.get('/courses/:courseId/fee-plans', { preHandler: [authenticate, requirePermission('admissions.manage')] }, async (req, reply) => {
    const p = validate(courseIdParam, req.params, reply);
    if (!p) return;
    return reply.send({ success: true, data: await listFeePlans(p.courseId, true) });
  });

  // ── Collection ──────────────────────────────────────────────────────────────
  app.get('/admin/admissions/:id/installments', { preHandler: [authenticate, requirePermission('admissions.view')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    return reply.send({ success: true, data: await listInstallments(p.id) });
  });

  app.get('/admin/admissions/:id/payments', { preHandler: [authenticate, requirePermission('admissions.view')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    return reply.send({ success: true, data: await listPayments(p.id) });
  });

  app.post('/admin/admissions/:id/payments', { preHandler: [authenticate, requirePermission('payments.record')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const input = validate(recordPaymentSchema, req.body, reply);
    if (!input) return;
    const result = await recordPayment(p.id, input, req.user.sub);
    await logAudit(req, {
      action: 'payment.recorded',
      entityType: 'admission',
      entityId: p.id,
      meta: { amount: input.amount, method: input.method, paymentId: result.payment.id },
    });
    return reply.status(201).send({ success: true, data: result });
  });

  // ── Fees & revenue overview (finance/admin) ──────────────────────────────────
  app.get('/admin/fees/overview', { preHandler: [authenticate, requirePermission('revenue.view')] }, async (req, reply) => {
    const q = validate(feesOverviewQuerySchema, req.query, reply);
    if (!q) return;
    return reply.send({ success: true, data: await getFeesOverview(q) });
  });

  app.get('/admin/fees/outstanding', { preHandler: [authenticate, requirePermission('revenue.view')] }, async (req, reply) => {
    const q = validate(outstandingQuerySchema, req.query, reply);
    if (!q) return;
    const result = await getOutstandingInstallments(q);
    return reply.send({ success: true, data: result.items, meta: { page: q.page, limit: q.limit, total: result.total } });
  });

  // UPI collect-request QR payload. Does NOT confirm payment — see service note.
  app.get('/admin/admissions/:id/upi-qr', { preHandler: [authenticate, requirePermission('payments.record')] }, async (req, reply) => {
    const p = validate(idParam, req.params, reply);
    if (!p) return;
    const amountRaw = Number((req.query as { amount?: string }).amount);
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A positive amount is required' } });
    }
    return reply.send({ success: true, data: await buildUpiRequest(p.id, amountRaw) });
  });
}
