import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import {
  registerDeviceToken,
  unregisterDeviceToken,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
  broadcastToBatch,
  sendNotificationToUser,
} from './notifications.service.js';

type ZodSchema<T> = {
  safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } };
};
function validate<T>(schema: ZodSchema<T>, value: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    void reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() } });
    return null;
  }
  return r.data;
}

const registerTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['android', 'ios']),
});

const broadcastSchema = z.object({
  batchId: z.string().uuid(),
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(1000),
  type: z.enum(['class_reminder', 'exam_alert', 'result', 'announcement', 'doubt_reply', 'achievement']),
  data: z.record(z.unknown()).optional(),
});

const sendToUserSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(1000),
  type: z.enum(['class_reminder', 'exam_alert', 'result', 'announcement', 'doubt_reply', 'achievement']),
  data: z.record(z.unknown()).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export default async function notificationsRoutes(app: FastifyInstance) {
  // ── Device token registration ─────────────────────────────────────────────

  app.post('/notifications/device-token', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(registerTokenSchema, req.body, reply);
    if (!input) return;
    const result = await registerDeviceToken(req.user.sub, input.token, input.platform);
    return reply.send({ success: true, data: result });
  });

  app.delete('/notifications/device-token', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(z.object({ token: z.string() }), req.body, reply);
    if (!input) return;
    const result = await unregisterDeviceToken(input.token);
    return reply.send({ success: true, data: result });
  });

  // ── User notifications ────────────────────────────────────────────────────

  app.get('/notifications', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(paginationSchema, req.query, reply);
    if (!input) return;
    const result = await listNotifications(req.user.sub, input.page, input.limit);
    return reply.send({
      success: true,
      data: result.items,
      meta: { page: input.page, limit: input.limit, total: result.total },
    });
  });

  app.get('/notifications/unread-count', { preHandler: [authenticate] }, async (req, reply) => {
    const count = await getUnreadCount(req.user.sub);
    return reply.send({ success: true, data: { count } });
  });

  app.patch('/notifications/:id/read', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await markNotificationRead(id, req.user.sub);
    return reply.send({ success: true, data: result });
  });

  app.patch('/notifications/read-all', { preHandler: [authenticate] }, async (req, reply) => {
    const result = await markAllNotificationsRead(req.user.sub);
    return reply.send({ success: true, data: result });
  });

  // ── Admin send ────────────────────────────────────────────────────────────

  app.post(
    '/admin/notifications/broadcast',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const input = validate(broadcastSchema, req.body, reply);
      if (!input) return;
      const result = await broadcastToBatch(
        input.batchId,
        input.title,
        input.body,
        input.type,
        input.data,
      );
      return reply.send({ success: true, data: result });
    },
  );

  app.post(
    '/admin/notifications/send',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (req, reply) => {
      const input = validate(sendToUserSchema, req.body, reply);
      if (!input) return;
      await sendNotificationToUser(
        input.userId,
        input.title,
        input.body,
        input.type,
        input.data,
      );
      return reply.send({ success: true, data: { sent: true } });
    },
  );
}
