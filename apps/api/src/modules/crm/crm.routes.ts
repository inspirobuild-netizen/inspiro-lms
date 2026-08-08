import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission, hasPermission } from '../../middleware/require-permission.js';
import { getCounsellorDashboard, getCrmOverview } from './crm.service.js';
import {
  exportAdmissionsCsv, exportLeadSourceCsv, exportRevenueCsv, exportPendingLeadsCsv,
  exportFollowupReportCsv, exportInactiveLeadsCsv, exportVerificationReportCsv,
} from './crm.service.js';

export default async function crmRoutes(app: FastifyInstance) {
  app.get('/crm/dashboard', { preHandler: [authenticate, requirePermission('leads.view')] }, async (req, reply) => {
    const viewAll = await hasPermission(req, 'leads.view_all');
    return reply.send({ success: true, data: await getCounsellorDashboard(req.user.sub, viewAll) });
  });

  app.get('/crm/analytics', { preHandler: [authenticate, requirePermission('analytics.view_all')] }, async (_req, reply) => {
    return reply.send({ success: true, data: await getCrmOverview() });
  });

  // ── Reports (CSV) ────────────────────────────────────────────────────────────
  const guard = { preHandler: [authenticate, requirePermission('reports.view')] };
  function csvReply(reply: import('fastify').FastifyReply, csv: string, filename: string) {
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${filename}"`).send(csv);
  }

  app.get('/crm/reports/admissions', guard, async (_req, reply) => csvReply(reply, await exportAdmissionsCsv(), 'admissions.csv'));
  app.get('/crm/reports/lead-source', guard, async (_req, reply) => csvReply(reply, await exportLeadSourceCsv(), 'lead-source.csv'));
  app.get('/crm/reports/revenue', guard, async (req, reply) => {
    const q = req.query as { period?: string; groupBy?: string };
    const period = (q.period ?? 'monthly') as 'daily' | 'monthly' | 'yearly';
    if (!['daily', 'monthly', 'yearly'].includes(period)) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'period must be daily, monthly or yearly' } });
    }
    const groupBy = q.groupBy as 'branch' | 'counsellor' | 'course' | undefined;
    if (groupBy && !['branch', 'counsellor', 'course'].includes(groupBy)) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'groupBy must be branch, counsellor or course' } });
    }
    const filename = groupBy ? `revenue-by-${groupBy}.csv` : `revenue-${period}.csv`;
    return csvReply(reply, await exportRevenueCsv(period, groupBy), filename);
  });
  app.get('/crm/reports/pending-leads', guard, async (_req, reply) => csvReply(reply, await exportPendingLeadsCsv(), 'pending-leads.csv'));
  app.get('/crm/reports/followups', guard, async (_req, reply) => csvReply(reply, await exportFollowupReportCsv(), 'followup-report.csv'));
  app.get('/crm/reports/inactive-leads', guard, async (req, reply) => {
    const days = Math.max(1, Number((req.query as { days?: string }).days) || 14);
    return csvReply(reply, await exportInactiveLeadsCsv(days), `inactive-leads-${days}d.csv`);
  });
  app.get('/crm/reports/verification', guard, async (_req, reply) => csvReply(reply, await exportVerificationReportCsv(), 'verification-report.csv'));
}
