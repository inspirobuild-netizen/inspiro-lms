import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { rejectSchema, requestChangesSchema, mergeDuplicateSchema } from './verification.schema.js';
import { listByStatus, getCounts, getHistory, approve, reject, requestChanges, mergeDuplicate } from './verification.service.js';
import { logAudit } from '../../lib/audit.js';

function bad(reply: import('fastify').FastifyReply, err: { flatten: () => unknown }) {
  return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
}

export default async function verificationRoutes(app: FastifyInstance) {
  app.get('/admin/students/verification/counts', { preHandler: [authenticate, requirePermission('students.verify')] }, async (_req, reply) => {
    return reply.send({ success: true, data: await getCounts() });
  });

  app.get('/admin/students/verification', { preHandler: [authenticate, requirePermission('students.verify')] }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const status = q.status || 'pending';
    const { items, total } = await listByStatus({ status, page, limit, search: q.search?.trim() || undefined });
    return reply.send({ success: true, data: items, meta: { page, limit, total } });
  });

  app.get('/admin/students/:id/verification-history', { preHandler: [authenticate, requirePermission('students.verify')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await getHistory(id) });
  });

  app.post('/admin/students/:id/approve', { preHandler: [authenticate, requirePermission('students.verify')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const student = await approve(id, req.user.sub);
    await logAudit(req, { action: 'student.verified', entityType: 'student', entityId: id });
    return reply.send({ success: true, data: student });
  });

  app.post('/admin/students/:id/reject', { preHandler: [authenticate, requirePermission('students.verify')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error);
    const student = await reject(id, req.user.sub, parsed.data.reason);
    await logAudit(req, { action: 'student.rejected', entityType: 'student', entityId: id, meta: { reason: parsed.data.reason } });
    return reply.send({ success: true, data: student });
  });

  app.post('/admin/students/:id/request-changes', { preHandler: [authenticate, requirePermission('students.verify')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = requestChangesSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error);
    const student = await requestChanges(id, req.user.sub, parsed.data.note);
    await logAudit(req, { action: 'student.changes_requested', entityType: 'student', entityId: id });
    return reply.send({ success: true, data: student });
  });

  app.post('/admin/students/merge-duplicate', { preHandler: [authenticate, requirePermission('students.verify')] }, async (req, reply) => {
    const parsed = mergeDuplicateSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error);
    const result = await mergeDuplicate(parsed.data.primaryId, parsed.data.duplicateId);
    await logAudit(req, { action: 'student.merged', entityType: 'student', entityId: parsed.data.primaryId, meta: { duplicateId: parsed.data.duplicateId } });
    return reply.send({ success: true, data: result });
  });
}
