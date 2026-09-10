import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveDoc, resolveImage } from '../../lib/local-storage.js';
import { requireRoleOrPermission } from '../../middleware/require-permission.js';
import { logAudit } from '../../lib/audit.js';
import {
  publishActivity,
  listActivitiesForStaff,
  listSubmissions,
  reviewSubmission,
  deleteActivity,
  listMyActivities,
  submitActivity,
  submitFeedback,
  listMyFeedback,
  listFeedback,
  resolveSubmissionAttachment,
} from './spaces.service.js';

const publishSchema = z.object({
  batchIds: z.array(z.string().uuid()).min(1).max(20),
  title: z.string().min(2).max(255),
  description: z.string().min(2).max(8000),
  dueAt: z.string().datetime().optional(),
  // Whether the student must attach their work, and what they may attach.
  requiresFile: z.boolean().default(false),
  allowedTypes: z.enum(['image', 'pdf', 'image,pdf']).default('image,pdf'),
});

const reviewSchema = z.object({ remarks: z.string().min(1).max(2000) });

// Body OR attachments — a photographed answer sheet carries no text, and
// demanding a caption for it would be busywork. The service enforces which
// of the two this particular activity actually requires.
const submitSchema = z.object({
  body: z.string().max(8000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        file: z.string().min(1).max(255),
        kind: z.enum(['image', 'pdf']),
      }),
    )
    .max(5)
    .optional(),
});

const feedbackSchema = z.object({
  category: z.enum(['teaching', 'content', 'app', 'other']),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().min(2).max(4000),
  batchId: z.string().uuid().optional(),
});

const feedbackListSchema = z.object({
  category: z.enum(['teaching', 'content', 'app', 'other']).optional(),
  batchId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

function bad(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, details: unknown) {
  return reply.status(400).send({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details },
  });
}

export default async function spacesRoutes(app: FastifyInstance) {
  // ── Staff: activities ──────────────────────────────────────────────────────
  app.post(
    '/admin/activities',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'activities.manage')] },
    async (req, reply) => {
      const parsed = publishSchema.safeParse(req.body);
      if (!parsed.success) return bad(reply, parsed.error.flatten());
      const rows = await publishActivity(parsed.data, req.user.sub, req.user.role);
      await logAudit(req, {
        action: 'activity.published',
        entityType: 'activity',
        entityId: rows[0]?.id ?? 'multi',
        meta: { title: parsed.data.title, batches: parsed.data.batchIds.length },
      });
      return reply.status(201).send({ success: true, data: rows });
    },
  );

  app.get(
    '/admin/activities',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'activities.view')] },
    async (req, reply) => {
      const { batchId } = req.query as { batchId?: string };
      const items = await listActivitiesForStaff(req.user.sub, req.user.role, batchId);
      return reply.send({ success: true, data: items });
    },
  );

  app.get(
    '/admin/activities/:id/submissions',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'activities.view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = await listSubmissions(id, req.user.sub, req.user.role);
      return reply.send({ success: true, data });
    },
  );

  app.post(
    '/admin/submissions/:id/review',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'activities.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) return bad(reply, parsed.error.flatten());
      const row = await reviewSubmission(id, parsed.data.remarks, req.user.sub, req.user.role);
      return reply.send({ success: true, data: row });
    },
  );

  app.delete(
    '/admin/activities/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'activities.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteActivity(id, req.user.sub, req.user.role);
      await logAudit(req, { action: 'activity.deleted', entityType: 'activity', entityId: id });
      return reply.send({ success: true, data: result });
    },
  );

  // ── Staff: feedback (coordinator + admin) ──────────────────────────────────
  app.get(
    '/admin/feedback',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'feedback.view')] },
    async (req, reply) => {
      const parsed = feedbackListSchema.safeParse(req.query);
      if (!parsed.success) return bad(reply, parsed.error.flatten());
      const data = await listFeedback(parsed.data);
      return reply.send({ success: true, data });
    },
  );

  // ── Student: activity space ────────────────────────────────────────────────

  // Serves a file attached to a submission, to the student who uploaded it or
  // to staff on that batch. Streamed through the API rather than a public
  // path so a guessable URL is worth nothing.
  app.get('/submissions/:id/attachment/:file', { preHandler: [authenticate] }, async (req, reply) => {
    const { id, file } = req.params as { id: string; file: string };
    const found = await resolveSubmissionAttachment(id, file, req.user.sub, req.user.role);
    const doc = found.kind === 'pdf' ? await resolveDoc(found.file) : await resolveImage(found.file);
    if (!doc) {
      return reply
        .status(404)
        .send({ success: false, error: { code: 'FILE_MISSING', message: 'That file is no longer available' } });
    }
    return reply
      .header('Content-Type', doc.contentType)
      .header('Content-Length', doc.size)
      .header('Content-Disposition', 'inline')
      .send(doc.stream);
  });

  app.get('/activities/my', { preHandler: [authenticate] }, async (req, reply) => {
    const items = await listMyActivities(req.user.sub);
    return reply.send({ success: true, data: items });
  });

  app.post('/activities/:id/submit', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1m' } },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error.flatten());
    const row = await submitActivity(id, req.user.sub, parsed.data.body, parsed.data.attachments);
    return reply.status(201).send({ success: true, data: row });
  });

  // ── Student: feedback space ────────────────────────────────────────────────
  app.post('/feedback', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 10, timeWindow: '10m' } },
  }, async (req, reply) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) return bad(reply, parsed.error.flatten());
    const row = await submitFeedback(req.user.sub, parsed.data);
    return reply.status(201).send({ success: true, data: row });
  });

  app.get('/feedback/my', { preHandler: [authenticate] }, async (req, reply) => {
    const items = await listMyFeedback(req.user.sub);
    return reply.send({ success: true, data: items });
  });
}
