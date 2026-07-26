import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { createStaffRoleSchema, updateStaffRoleSchema, setRolePermissionsSchema } from './staff-roles.schema.js';
import {
  getPermissionCatalog,
  listStaffRoles,
  getStaffRole,
  createStaffRole,
  updateStaffRole,
  deleteStaffRole,
  setRolePermissions,
} from './staff-roles.service.js';
import { logAudit } from '../../lib/audit.js';

export default async function staffRolesRoutes(app: FastifyInstance) {
  // Permission catalog (for the matrix UI + role assignment dropdowns)
  app.get('/admin/permissions', { preHandler: [authenticate, requireRole(['admin', 'staff'])] }, async (_req, reply) => {
    return reply.send({ success: true, data: getPermissionCatalog() });
  });

  // Roles list — anyone who can view/manage staff needs it (assignment dropdowns)
  app.get('/admin/staff-roles', { preHandler: [authenticate, requireRole(['admin', 'staff'])] }, async (_req, reply) => {
    return reply.send({ success: true, data: await listStaffRoles() });
  });

  app.get('/admin/staff-roles/:id', { preHandler: [authenticate, requirePermission('roles.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await getStaffRole(id) });
  });

  app.post('/admin/staff-roles', { preHandler: [authenticate, requirePermission('roles.manage')] }, async (req, reply) => {
    const parsed = createStaffRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const role = await createStaffRole(parsed.data);
    await logAudit(req, { action: 'role.created', entityType: 'staff_role', entityId: role.id, meta: { name: role.name } });
    return reply.status(201).send({ success: true, data: role });
  });

  app.patch('/admin/staff-roles/:id', { preHandler: [authenticate, requirePermission('roles.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateStaffRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const role = await updateStaffRole(id, parsed.data);
    await logAudit(req, { action: 'role.updated', entityType: 'staff_role', entityId: id });
    return reply.send({ success: true, data: role });
  });

  app.put('/admin/staff-roles/:id/permissions', { preHandler: [authenticate, requirePermission('roles.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = setRolePermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const result = await setRolePermissions(id, parsed.data.permissions);
    await logAudit(req, { action: 'role.permissions_updated', entityType: 'staff_role', entityId: id, meta: { count: result.permissions.length } });
    return reply.send({ success: true, data: result });
  });

  app.delete('/admin/staff-roles/:id', { preHandler: [authenticate, requirePermission('roles.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteStaffRole(id);
    await logAudit(req, { action: 'role.deleted', entityType: 'staff_role', entityId: id });
    return reply.send({ success: true, data: { deleted: true } });
  });
}
