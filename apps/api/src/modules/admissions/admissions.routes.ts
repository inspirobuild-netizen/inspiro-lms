import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission, hasPermission } from '../../middleware/require-permission.js';
import { updatePaymentSchema, setTargetSchema } from './admissions.schema.js';
import { listAdmissions, updatePayment, setTarget, getTarget } from './admissions.service.js';
import { logAudit } from '../../lib/audit.js';

export default async function admissionsRoutes(app: FastifyInstance) {
  app.get('/admissions', { preHandler: [authenticate, requirePermission('admissions.view')] }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const viewAll = await hasPermission(req, 'admissions.view_all');
    const { items, total } = await listAdmissions({
      page, limit, counsellorId: req.user.sub, viewAll,
      batchId: q.batchId || undefined, branchId: q.branchId || undefined,
      paymentStatus: q.paymentStatus || undefined, search: q.search?.trim() || undefined,
    });
    return reply.send({ success: true, data: items, meta: { page, limit, total } });
  });

  app.patch('/admissions/:id/payment', { preHandler: [authenticate, requirePermission('admissions.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updatePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const adm = await updatePayment(id, parsed.data);
    await logAudit(req, { action: 'admission.payment_updated', entityType: 'admission', entityId: id, meta: { paymentStatus: adm.paymentStatus } });
    return reply.send({ success: true, data: adm });
  });

  // Counsellor targets — a counsellor reads their own; managers/admin set them.
  app.get('/admissions/targets', { preHandler: [authenticate, requirePermission('admissions.view')] }, async (req, reply) => {
    const q = req.query as { counsellorId?: string; period?: string };
    const period = q.period || new Date().toISOString().slice(0, 7);
    const counsellorId = q.counsellorId || req.user.sub;
    return reply.send({ success: true, data: await getTarget(counsellorId, period) });
  });

  app.put('/admissions/targets', { preHandler: [authenticate, requirePermission('admissions.view_all')] }, async (req, reply) => {
    const parsed = setTargetSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const row = await setTarget(parsed.data);
    await logAudit(req, { action: 'counsellor.target_set', entityType: 'counsellor_target', entityId: row.id });
    return reply.send({ success: true, data: row });
  });
}
