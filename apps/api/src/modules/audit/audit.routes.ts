import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { db } from '../../lib/db.js';
import { auditLogs, users } from '../../../drizzle/schema.js';

export default async function auditRoutes(app: FastifyInstance) {
  app.get('/admin/audit-logs', { preHandler: [authenticate, requirePermission('audit.view')] }, async (req, reply) => {
    const q = req.query as { page?: string; limit?: string; action?: string; entityType?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));

    const conds = [];
    if (q.action) conds.push(ilike(auditLogs.action, `%${q.action}%`));
    if (q.entityType) conds.push(eq(auditLogs.entityType, q.entityType));
    const where = conds.length ? and(...conds) : undefined;

    const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);
    const items = await db
      .select({
        id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId,
        ipAddress: auditLogs.ipAddress, meta: auditLogs.meta, createdAt: auditLogs.createdAt, actorName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return reply.send({ success: true, data: items, meta: { page, limit, total } });
  });
}
