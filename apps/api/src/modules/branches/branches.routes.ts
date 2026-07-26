import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { createBranchSchema, updateBranchSchema } from './branches.schema.js';
import { listBranches, getBranchById, createBranch, updateBranch } from './branches.service.js';
import { logAudit } from '../../lib/audit.js';

export default async function branchesRoutes(app: FastifyInstance) {
  // List — any admin/staff/instructor (branches are reference data for dropdowns)
  app.get('/admin/branches', { preHandler: [authenticate, requireRole(['admin', 'staff', 'instructor'])] }, async (req, reply) => {
    const q = req.query as { page?: string; limit?: string; search?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const { items, total } = await listBranches(page, limit, q.search?.trim() || undefined);
    return reply.send({ success: true, data: items, meta: { page, limit, total } });
  });

  app.get('/admin/branches/:id', { preHandler: [authenticate, requireRole(['admin', 'staff', 'instructor'])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await getBranchById(id) });
  });

  app.post('/admin/branches', { preHandler: [authenticate, requirePermission('branches.manage')] }, async (req, reply) => {
    const parsed = createBranchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const branch = await createBranch(parsed.data);
    await logAudit(req, { action: 'branch.created', entityType: 'branch', entityId: branch.id, meta: { name: branch.name } });
    return reply.status(201).send({ success: true, data: branch });
  });

  app.patch('/admin/branches/:id', { preHandler: [authenticate, requirePermission('branches.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateBranchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const branch = await updateBranch(id, parsed.data);
    await logAudit(req, { action: 'branch.updated', entityType: 'branch', entityId: id });
    return reply.send({ success: true, data: branch });
  });
}
