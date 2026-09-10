import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { getSettings, setSetting, SETTING_DEFAULTS, type SettingKey } from './settings.service.js';
import { logAudit } from '../../lib/audit.js';

const bodySchema = z.object({
  key: z.enum(Object.keys(SETTING_DEFAULTS) as [SettingKey, ...SettingKey[]]),
  value: z.boolean(),
});

export default async function settingsRoutes(app: FastifyInstance) {
  // Staff read: the admin screen renders current state.
  app.get('/admin/settings', { preHandler: [authenticate, requireRole(['admin'])] }, async (_req, reply) => {
    return reply.send({ success: true, data: await getSettings() });
  });

  // The app reads the subset it needs to decide what to offer a student.
  // Deliberately unauthenticated-safe: it exposes no data about anyone.
  app.get('/settings/public', { preHandler: [authenticate] }, async (_req, reply) => {
    const s = await getSettings();
    return reply.send({
      success: true,
      data: {
        aiDoubtsEnabled: s.aiDoubtsEnabled,
        aiDoubtsStudentChoice: s.aiDoubtsStudentChoice,
      },
    });
  });

  // Changing a switch is an admin act and is audited: "who turned the AI off"
  // is exactly the question asked after a complaint.
  app.patch('/admin/settings', { preHandler: [authenticate, requireRole(['admin'])] }, async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Unknown setting or value' },
      });
    }
    const { key, value } = parsed.data;
    const result = await setSetting(key, value, req.user.sub);
    await logAudit(req, { action: 'settings.updated', entityType: 'setting', entityId: key, meta: { value } });
    return reply.send({ success: true, data: result });
  });
}
