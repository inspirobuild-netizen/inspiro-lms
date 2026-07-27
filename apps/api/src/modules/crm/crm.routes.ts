import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission, hasPermission } from '../../middleware/require-permission.js';
import { getCounsellorDashboard, getCrmOverview } from './crm.service.js';

export default async function crmRoutes(app: FastifyInstance) {
  app.get('/crm/dashboard', { preHandler: [authenticate, requirePermission('leads.view')] }, async (req, reply) => {
    const viewAll = await hasPermission(req, 'leads.view_all');
    return reply.send({ success: true, data: await getCounsellorDashboard(req.user.sub, viewAll) });
  });

  app.get('/crm/analytics', { preHandler: [authenticate, requirePermission('analytics.view_all')] }, async (_req, reply) => {
    return reply.send({ success: true, data: await getCrmOverview() });
  });
}
