import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { getSettings, setSetting, SETTING_SCHEMAS, type SettingKey } from './settings.service.js';
import { aiAnswerQuota } from '../doubts/doubts.service.js';
import { logAudit } from '../../lib/audit.js';

export default async function settingsRoutes(app: FastifyInstance) {
  // Staff read: the admin screen renders current state.
  app.get('/admin/settings', { preHandler: [authenticate, requireRole(['admin'])] }, async (_req, reply) => {
    return reply.send({ success: true, data: await getSettings() });
  });

  // The app reads the subset it needs to decide what to offer a student:
  // the academy's switches, and how many AI answers this student has left
  // today. Nothing about anyone else.
  app.get('/settings/public', { preHandler: [authenticate] }, async (req, reply) => {
    const s = await getSettings();
    const quota = await aiAnswerQuota(req.user.sub, s.aiDoubtsDailyLimit);
    return reply.send({
      success: true,
      data: {
        aiDoubtsEnabled: s.aiDoubtsEnabled,
        aiDoubtsStudentChoice: s.aiDoubtsStudentChoice,
        aiDoubtsDailyLimit: quota.limit,
        aiAnswersUsedToday: quota.used,
        aiAnswersLeftToday: quota.left,
      },
    });
  });

  // Changing a switch is an admin act and is audited: "who turned the AI off"
  // is exactly the question asked after a complaint.
  app.patch('/admin/settings', { preHandler: [authenticate, requireRole(['admin'])] }, async (req, reply) => {
    const body = (req.body ?? {}) as { key?: unknown; value?: unknown };
    const key = typeof body.key === 'string' && body.key in SETTING_SCHEMAS ? (body.key as SettingKey) : null;
    const parsed = key ? SETTING_SCHEMAS[key].safeParse(body.value) : null;
    if (!key || !parsed?.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Unknown setting or value' },
      });
    }
    const result = await setSetting(key, parsed.data, req.user.sub);
    // The key goes in meta: entityId is a uuid column, and putting the key
    // there made every one of these audit writes fail.
    await logAudit(req, { action: 'settings.updated', entityType: 'setting', meta: { key, value: parsed.data } });
    return reply.send({ success: true, data: result });
  });
}
