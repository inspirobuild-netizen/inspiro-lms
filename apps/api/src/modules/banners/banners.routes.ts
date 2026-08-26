import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, or, asc, isNull, lte, gte, sql, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { banners, courses, users, batchEnrollments } from '../../../drizzle/schema.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoleOrPermission } from '../../middleware/require-permission.js';
import { logAudit } from '../../lib/audit.js';
import { sendNotificationToUser } from '../notifications/notifications.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Home banners and broadcast pushes — the academy's own marketing surface.
 *
 * Banners are ordered promo cards on the student home screen. Broadcasts are
 * one-off notifications to every active student, distinct from the existing
 * per-batch broadcast which targets one cohort.
 */

const bannerSchema = z.object({
  title: z.string().min(2).max(160),
  imageUrl: z.string().url().max(2048),
  courseId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

const broadcastAllSchema = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(2).max(500),
});

function bad(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, details: unknown) {
  return reply.status(400).send({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details },
  });
}

export default async function bannersRoutes(app: FastifyInstance) {
  // ── Student: the live banner rail ──────────────────────────────────────────
  // Filtering happens in SQL so a scheduled banner appears and disappears on
  // its own — nobody has to remember to switch it off.
  app.get('/banners', { preHandler: [authenticate] }, async (_req, reply) => {
    const now = new Date();
    const rows = await db
      .select({
        id: banners.id,
        title: banners.title,
        imageUrl: banners.imageUrl,
        courseId: banners.courseId,
      })
      .from(banners)
      .where(
        and(
          eq(banners.isActive, true),
          or(isNull(banners.startsAt), lte(banners.startsAt, now)),
          or(isNull(banners.endsAt), gte(banners.endsAt, now)),
        ),
      )
      .orderBy(asc(banners.sortOrder), asc(banners.createdAt))
      .limit(12);
    return reply.send({ success: true, data: rows });
  });

  // ── Staff: manage ──────────────────────────────────────────────────────────
  app.get(
    '/admin/banners',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'banners.manage')] },
    async (_req, reply) => {
      const rows = await db
        .select({
          id: banners.id,
          title: banners.title,
          imageUrl: banners.imageUrl,
          courseId: banners.courseId,
          courseTitle: courses.title,
          sortOrder: banners.sortOrder,
          isActive: banners.isActive,
          startsAt: banners.startsAt,
          endsAt: banners.endsAt,
          createdByName: users.name,
          createdAt: banners.createdAt,
        })
        .from(banners)
        .leftJoin(courses, eq(courses.id, banners.courseId))
        .leftJoin(users, eq(users.id, banners.createdBy))
        .orderBy(asc(banners.sortOrder), asc(banners.createdAt));
      return reply.send({ success: true, data: rows });
    },
  );

  app.post(
    '/admin/banners',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'banners.manage')] },
    async (req, reply) => {
      const parsed = bannerSchema.safeParse(req.body);
      if (!parsed.success) return bad(reply, parsed.error.flatten());
      const d = parsed.data;
      const [row] = await db
        .insert(banners)
        .values({
          title: d.title,
          imageUrl: d.imageUrl,
          courseId: d.courseId ?? null,
          sortOrder: d.sortOrder,
          isActive: d.isActive,
          startsAt: d.startsAt ? new Date(d.startsAt) : null,
          endsAt: d.endsAt ? new Date(d.endsAt) : null,
          createdBy: req.user.sub,
        })
        .returning();
      await logAudit(req, { action: 'banner.created', entityType: 'banner', entityId: row!.id, meta: { title: d.title } });
      return reply.status(201).send({ success: true, data: row });
    },
  );

  app.patch(
    '/admin/banners/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'banners.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = bannerSchema.partial().safeParse(req.body);
      if (!parsed.success) return bad(reply, parsed.error.flatten());
      const d = parsed.data;
      const [row] = await db
        .update(banners)
        .set({
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.imageUrl !== undefined ? { imageUrl: d.imageUrl } : {}),
          ...(d.courseId !== undefined ? { courseId: d.courseId } : {}),
          ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
          ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
          ...(d.startsAt !== undefined ? { startsAt: d.startsAt ? new Date(d.startsAt) : null } : {}),
          ...(d.endsAt !== undefined ? { endsAt: d.endsAt ? new Date(d.endsAt) : null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(banners.id, id))
        .returning();
      if (!row) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Banner not found' } });
      }
      return reply.send({ success: true, data: row });
    },
  );

  app.delete(
    '/admin/banners/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'banners.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await db.delete(banners).where(eq(banners.id, id));
      await logAudit(req, { action: 'banner.deleted', entityType: 'banner', entityId: id });
      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  // ── Staff: broadcast to every active student ───────────────────────────────
  // Distinct from /admin/notifications/broadcast, which targets one batch.
  app.post(
    '/admin/notifications/broadcast-all',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'banners.manage')] },
    async (req, reply) => {
      const parsed = broadcastAllSchema.safeParse(req.body);
      if (!parsed.success) return bad(reply, parsed.error.flatten());
      const { title, body } = parsed.data;

      // Every student with an ACTIVE enrolment — not simply every user row,
      // which would include disabled accounts and staff.
      const rows = await db
        .selectDistinct({ userId: batchEnrollments.userId })
        .from(batchEnrollments)
        .innerJoin(users, eq(users.id, batchEnrollments.userId))
        .where(and(eq(batchEnrollments.status, 'active'), eq(users.isActive, true)));
      const userIds = rows.map((r) => r.userId);

      if (userIds.length === 0) return reply.send({ success: true, data: { sent: 0 } });

      // sendNotificationToUser BOTH persists the row and pushes to the
      // student's devices. Bulk-inserting first as well gave every student two
      // copies of the same message — caught in testing, 12 sent / 24 rows.
      // Best-effort per student, so one dead device token cannot stop the rest.
      let pushed = 0;
      for (const userId of userIds) {
        try {
          await sendNotificationToUser(userId, title, body, 'announcement', { kind: 'broadcast' });
          pushed++;
        } catch (e) {
          logger.warn({ e, userId }, 'Broadcast failed for one student');
        }
      }

      await logAudit(req, {
        action: 'notification.broadcast_all',
        entityType: 'notification',
        entityId: 'all',
        meta: { title, recipients: userIds.length },
      });
      return reply.send({ success: true, data: { sent: userIds.length, pushed } });
    },
  );
}
