import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission, hasPermission } from '../../middleware/require-permission.js';
import { createLeadSchema, updateLeadSchema, addFollowupSchema, changeStatusSchema, convertLeadSchema } from './leads.schema.js';
import {
  listLeads, getPipeline, getLead, getFollowups, createLead, updateLead, addFollowup, changeStatus, convertLead,
} from './leads.service.js';
import { logAudit } from '../../lib/audit.js';

function bad(reply: import('fastify').FastifyReply, err: { flatten: () => unknown }) {
  return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
}

export default async function leadsRoutes(app: FastifyInstance) {
  app.get('/leads', { preHandler: [authenticate, requirePermission('leads.view')] }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const viewAll = await hasPermission(req, 'leads.view_all');
    const { items, total } = await listLeads({ page, limit, status: q.status, priority: q.priority, source: q.source, search: q.search?.trim() || undefined, ownerId: req.user.sub, viewAll });
    return reply.send({ success: true, data: items, meta: { page, limit, total } });
  });

  app.get('/leads/pipeline', { preHandler: [authenticate, requirePermission('leads.view')] }, async (req, reply) => {
    const viewAll = await hasPermission(req, 'leads.view_all');
    return reply.send({ success: true, data: await getPipeline({ ownerId: req.user.sub, viewAll }) });
  });

  app.get('/leads/:id', { preHandler: [authenticate, requirePermission('leads.view')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const viewAll = await hasPermission(req, 'leads.view_all');
    return reply.send({ success: true, data: await getLead(id, { ownerId: req.user.sub, viewAll }) });
  });

  app.get('/leads/:id/followups', { preHandler: [authenticate, requirePermission('leads.view')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const viewAll = await hasPermission(req, 'leads.view_all');
    await getLead(id, { ownerId: req.user.sub, viewAll }); // ownership guard
    return reply.send({ success: true, data: await getFollowups(id) });
  });

  app.post('/leads', { preHandler: [authenticate, requirePermission('leads.manage')] }, async (req, reply) => {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error);
    const lead = await createLead(parsed.data, req.user.sub, req.user.sub);
    await logAudit(req, { action: 'lead.created', entityType: 'lead', entityId: lead.id, meta: { leadCode: lead.leadCode } });
    return reply.status(201).send({ success: true, data: lead });
  });

  app.patch('/leads/:id', { preHandler: [authenticate, requirePermission('leads.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error);
    const viewAll = await hasPermission(req, 'leads.view_all');
    await getLead(id, { ownerId: req.user.sub, viewAll });
    const lead = await updateLead(id, parsed.data);
    await logAudit(req, { action: 'lead.updated', entityType: 'lead', entityId: id });
    return reply.send({ success: true, data: lead });
  });

  app.post('/leads/:id/followups', { preHandler: [authenticate, requirePermission('leads.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = addFollowupSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error);
    const viewAll = await hasPermission(req, 'leads.view_all');
    await getLead(id, { ownerId: req.user.sub, viewAll });
    const fu = await addFollowup(id, req.user.sub, parsed.data);
    await logAudit(req, { action: 'lead.followup_added', entityType: 'lead', entityId: id });
    return reply.status(201).send({ success: true, data: fu });
  });

  app.patch('/leads/:id/status', { preHandler: [authenticate, requirePermission('leads.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = changeStatusSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error);
    const viewAll = await hasPermission(req, 'leads.view_all');
    await getLead(id, { ownerId: req.user.sub, viewAll });
    const result = await changeStatus(id, parsed.data.status, req.user.sub);
    await logAudit(req, { action: 'lead.status_changed', entityType: 'lead', entityId: id, meta: { status: parsed.data.status } });
    return reply.send({ success: true, data: result });
  });

  app.post('/leads/:id/convert', { preHandler: [authenticate, requirePermission('admissions.manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = convertLeadSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error);
    const viewAll = await hasPermission(req, 'leads.view_all');
    await getLead(id, { ownerId: req.user.sub, viewAll });
    const result = await convertLead(id, parsed.data, req.user.sub);
    await logAudit(req, { action: 'lead.converted', entityType: 'lead', entityId: id, meta: { admissionNo: result.admissionNo, studentId: result.studentId } });
    return reply.status(201).send({ success: true, data: result });
  });
}
