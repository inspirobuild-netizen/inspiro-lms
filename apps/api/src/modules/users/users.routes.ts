import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { deleteOwnAccount } from './account-deletion.service.js';
import { logAudit } from '../../lib/audit.js';
import { requireRole } from '../../middleware/require-role.js';
import { requireRoleOrPermission } from '../../middleware/require-permission.js';
import {
  updateProfileSchema,
  createUserSchema,
  listUsersSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from './users.schema.js';
import {
  getMyProfile,
  updateMyProfile,
  createUser,
  listUsers,
  getUserById,
  updateUserRole,
  setUserStatus,
} from './users.service.js';

export default async function usersRoutes(app: FastifyInstance) {
  // ── Self-service account deletion (App Store 5.1.1(v), Play user-data policy) ──
  // The client confirms twice before calling this; the server does not ask
  // again, because "are you sure" over an API is theatre. It is irreversible.
  app.delete('/me', { preHandler: [authenticate] }, async (req, reply) => {
    const result = await deleteOwnAccount(req.user.sub);
    await logAudit(req, {
      action: 'account.deleted_by_owner',
      entityType: 'user',
      entityId: req.user.sub,
      // The number is logged so an appeal ("I did not do this") can be
      // investigated; it is the only place it now exists.
      meta: { formerPhone: result.formerPhone },
    });
    return reply.send({ success: true, data: { deleted: true } });
  });

  // ── Student: own profile ──────────────────────────────────────────────────
  app.get('/profile/me', { preHandler: [authenticate] }, async (req, reply) => {
    const profile = await getMyProfile(req.user.sub);
    return reply.send({ success: true, data: profile });
  });

  app.patch('/profile/me', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }
    const updated = await updateMyProfile(req.user.sub, parsed.data);
    return reply.send({ success: true, data: updated });
  });

  // ── Admin: create user ────────────────────────────────────────────────────
  app.post(
    '/admin/users',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'students.manage')] },
    async (req, reply) => {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid user data', details: parsed.error.flatten() },
        });
      }
      const user = await createUser(parsed.data);
      return reply.status(201).send({ success: true, data: user });
    },
  );

  // ── Admin: list users ─────────────────────────────────────────────────────
  app.get(
    '/admin/users',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'students.view')] },
    async (req, reply) => {
      const parsed = listUsersSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.flatten() },
        });
      }
      const { items, total } = await listUsers(parsed.data);
      const { page, limit } = parsed.data;
      return reply.send({ success: true, data: items, meta: { page, limit, total } });
    },
  );

  // ── Admin: single user ────────────────────────────────────────────────────
  app.get(
    '/admin/users/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'students.view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const user = await getUserById(id);
      return reply.send({ success: true, data: user });
    },
  );

  // ── Admin: update role ────────────────────────────────────────────────────
  app.patch(
    '/admin/users/:id/role',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateUserRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid role', details: parsed.error.flatten() },
        });
      }
      const user = await updateUserRole(id, parsed.data.role);
      return reply.send({ success: true, data: user });
    },
  );

  // ── Admin: suspend / reactivate ───────────────────────────────────────────
  app.patch(
    '/admin/users/:id/status',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'students.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateUserStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid status', details: parsed.error.flatten() },
        });
      }
      const user = await setUserStatus(id, parsed.data.isActive);
      return reply.send({ success: true, data: user });
    },
  );
}
