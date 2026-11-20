import type { FastifyReply, FastifyRequest } from 'fastify';
import { bustUserStaffRoles, getRolePermissions, getStaffRoleIds, mergePermissions } from '../lib/permissions.js';
import type { JwtPayload } from './authenticate.js';

// A staff member may hold several roles; what they may do is the union of
// those roles' permissions. null when they hold no role at all.
async function staffPermissions(userId: string): Promise<string[] | null> {
  const ids = await getStaffRoleIds(userId);
  if (ids.length === 0) return null;
  return mergePermissions(await Promise.all(ids.map(getRolePermissions)));
}

export async function bustStaffRoleCache(userId: string): Promise<void> {
  await bustUserStaffRoles(userId);
}

// Non-throwing permission check for finer-grained logic inside handlers
// (e.g. "own leads" vs "all leads"). Admins hold every permission.
export async function hasPermission(req: FastifyRequest, code: string): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'staff') return false;
  const perms = await staffPermissions(req.user.sub);
  return !!perms && perms.includes(code);
}

// Gate a route on a permission code. Admins bypass (full access). Staff are
// checked against their role's permission set. Must run after `authenticate`.
export function requirePermission(code: string) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.user) {
      reply.status(401).send({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      return;
    }
    if (req.user.role === 'admin') return; // full access

    if (req.user.role !== 'staff') {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }

    const perms = await staffPermissions(req.user.sub);
    if (!perms) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'No role assigned' } });
      return;
    }
    if (!perms.includes(code)) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}

// Legacy-page retrofit helper: preserves an existing `requireRole([...])` guard
// UNCHANGED for the roles listed (e.g. admin/instructor keep exactly the access
// they always had), and ADDITIONALLY lets a 'staff' user in if their role
// holds `permissionCode`. Use this instead of switching a route straight to
// requirePermission() when you don't want to touch non-staff behavior.
export function requireRoleOrPermission(roles: JwtPayload['role'][], permissionCode: string) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.user) {
      reply.status(401).send({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      return;
    }
    if (roles.includes(req.user.role)) return; // unchanged legacy access

    if (req.user.role !== 'staff') {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }
    const perms = await staffPermissions(req.user.sub);
    if (!perms) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'No role assigned' } });
      return;
    }
    if (!perms.includes(permissionCode)) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}
