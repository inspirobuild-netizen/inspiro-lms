import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { logAudit } from '../../lib/audit.js';
import {
  listApprovals,
  counsellorSummary,
  verifyPayment,
  rejectPayment,
  activateEnrollment,
} from './finance.service.js';

const rejectSchema = z.object({ reason: z.string().max(500).optional() });

/**
 * Admin-only, and deliberately requireRole rather than requirePermission:
 * this is the checker half of the maker-checker over counsellor admissions,
 * so it must be impossible to grant it to a staff role by (mis)configuring
 * the permission matrix. If a finance officer ever needs it, that is a
 * decision to change code, not a checkbox.
 */
export default async function financeRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: [authenticate, requireRole(['admin'])] };

  // ── The approval queue ─────────────────────────────────────────────────────
  app.get('/admin/finance/approvals', adminOnly, async (req, reply) => {
    const { counsellorId } = req.query as { counsellorId?: string };
    const items = await listApprovals(counsellorId);
    return reply.send({ success: true, data: items });
  });

  // ── Per-counsellor claimed vs confirmed ───────────────────────────────────
  app.get('/admin/finance/counsellors', adminOnly, async (_req, reply) => {
    const items = await counsellorSummary();
    return reply.send({ success: true, data: items });
  });

  // ── Verify a payment claim ────────────────────────────────────────────────
  app.post('/admin/finance/payments/:id/verify', adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await verifyPayment(id, req.user.sub);
    await logAudit(req, { action: 'finance.payment_verified', entityType: 'payment', entityId: id, meta: result });
    return reply.send({ success: true, data: result });
  });

  // ── Reject a payment claim ────────────────────────────────────────────────
  app.post('/admin/finance/payments/:id/reject', adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = rejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }
    const result = await rejectPayment(id, req.user.sub, parsed.data.reason);
    await logAudit(req, {
      action: 'finance.payment_rejected',
      entityType: 'payment',
      entityId: id,
      meta: { reason: parsed.data.reason ?? null },
    });
    return reply.send({ success: true, data: result });
  });

  // ── Open the door: activate a pending enrolment ───────────────────────────
  app.post('/admin/finance/enrollments/:id/activate', adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await activateEnrollment(id);
    await logAudit(req, { action: 'finance.enrollment_activated', entityType: 'batch_enrollment', entityId: id });
    return reply.send({ success: true, data: result });
  });
}
