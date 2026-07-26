import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import {
  createStaffSchema,
  updateStaffSchema,
  staffStatusSchema,
  staffResetPasswordSchema,
} from './staff.schema.js';
import {
  listStaff,
  getStaffById,
  createStaff,
  updateStaff,
  setStaffStatus,
  resetStaffPassword,
  forceStaffReset,
} from './staff.service.js';
import { logAudit } from '../../lib/audit.js';
import { sendEmail, staffWelcomeEmail } from '../../lib/mailer.js';

function loginUrl(): string {
  return process.env['ADMIN_BASE_URL'] ?? 'https://admin.inspiroiasacademy.in';
}

export default async function staffRoutes(app: FastifyInstance) {
  app.get('/admin/staff', { preHandler: [authenticate, requirePermission('staff.view')] }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const { items, total } = await listStaff({
      page,
      limit,
      staffRoleId: q.staffRoleId || undefined,
      branchId: q.branchId || undefined,
      isActive: q.isActive === undefined ? undefined : q.isActive === 'true',
      search: q.search?.trim() || undefined,
    });
    return reply.send({ success: true, data: items, meta: { page, limit, total } });
  });

  app.get('/admin/staff/:id', { preHandler: [authenticate, requirePermission('staff.view')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await getStaffById(id) });
  });

  app.post('/admin/staff', { preHandler: [authenticate, requirePermission('staff.manage')] }, async (req, reply) => {
    const parsed = createStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const staff = await createStaff(parsed.data);
    await logAudit(req, { action: 'staff.created', entityType: 'staff', entityId: staff.id, meta: { employeeId: staff.employeeId } });
    // Fire-and-forget credentials email (never blocks creation)
    const { subject, html } = staffWelcomeEmail(staff.name, parsed.data.email, parsed.data.password, loginUrl());
    void sendEmail({ to: parsed.data.email, subject, html });
    return reply.status(201).send({ success: true, data: staff });
  });

  app.patch('/admin/staff/:id', { preHandler: [authenticate, requirePermission('staff.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const staff = await updateStaff(id, parsed.data);
    await logAudit(req, { action: 'staff.updated', entityType: 'staff', entityId: id });
    return reply.send({ success: true, data: staff });
  });

  app.patch('/admin/staff/:id/status', { preHandler: [authenticate, requirePermission('staff.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = staffStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }
    const staff = await setStaffStatus(id, parsed.data.isActive);
    await logAudit(req, { action: parsed.data.isActive ? 'staff.activated' : 'staff.deactivated', entityType: 'staff', entityId: id });
    return reply.send({ success: true, data: staff });
  });

  app.post('/admin/staff/:id/reset-password', { preHandler: [authenticate, requirePermission('staff.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = staffResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } });
    }
    const staff = await resetStaffPassword(id, parsed.data.password);
    await logAudit(req, { action: 'staff.password_reset', entityType: 'staff', entityId: id });
    if (staff.email) {
      const { subject, html } = staffWelcomeEmail(staff.name, staff.email, parsed.data.password, loginUrl());
      void sendEmail({ to: staff.email, subject, html });
    }
    return reply.send({ success: true, data: { reset: true } });
  });

  app.post('/admin/staff/:id/force-reset', { preHandler: [authenticate, requirePermission('staff.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await forceStaffReset(id);
    await logAudit(req, { action: 'staff.force_reset', entityType: 'staff', entityId: id });
    return reply.send({ success: true, data: { forced: true } });
  });
}
