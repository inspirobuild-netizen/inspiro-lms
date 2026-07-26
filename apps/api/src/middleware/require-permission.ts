import type { FastifyReply, FastifyRequest } from 'fastify';
import { getRolePermissions } from '../lib/permissions.js';
import { db } from '../lib/db.js';
import { redis } from '../lib/redis.js';
import { users } from '../../drizzle/schema.js';
import { eq } from 'drizzle-orm';

// Cache the user → staffRoleId lookup briefly so permission checks are cheap.
const STAFF_ROLE_TTL = 300;

async function getStaffRoleId(userId: string): Promise<string | null> {
  const key = `user:staffrole:${userId}`;
  const cached = await redis.get(key);
  if (cached !== null) return cached === '' ? null : cached;

  const [u] = await db.select({ staffRoleId: users.staffRoleId }).from(users).where(eq(users.id, userId)).limit(1);
  const val = u?.staffRoleId ?? null;
  await redis.set(key, val ?? '', 'EX', STAFF_ROLE_TTL);
  return val;
}

export async function bustStaffRoleCache(userId: string): Promise<void> {
  await redis.del(`user:staffrole:${userId}`);
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

    const staffRoleId = await getStaffRoleId(req.user.sub);
    if (!staffRoleId) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'No role assigned' } });
      return;
    }
    const perms = await getRolePermissions(staffRoleId);
    if (!perms.includes(code)) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}
