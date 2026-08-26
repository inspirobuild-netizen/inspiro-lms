import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { requireRole } from '../../middleware/require-role.js';
import { logAudit } from '../../lib/audit.js';
import { getMentorWorkload } from './mentors.service.js';
import {
  listMentors,
  setMentorProfile,
  setMentorBatches,
  getMentorBatches,
  getBatchPerformance,
} from './mentors.extra.js';

const profileSchema = z.object({
  coreSubject: z.string().min(2).max(100),
  strongSubjects: z.array(z.string().min(1).max(100)).max(10).default([]),
});
const batchesSchema = z.object({ batchIds: z.array(z.string().uuid()).max(50) });

export default async function mentorsRoutes(app: FastifyInstance) {
  app.get('/admin/mentors/workload', { preHandler: [authenticate, requirePermission('mentors.view')] }, async (_req, reply) => {
    return reply.send({ success: true, data: await getMentorWorkload() });
  });

  // ── Admin: mentor configuration ────────────────────────────────────────────
  // requireRole admin: mapping a mentor to batches decides whose students
  // they can see, so it stays with the admin, like the finance checker.
  app.get('/admin/mentors', { preHandler: [authenticate, requireRole(['admin'])] }, async (_req, reply) => {
    return reply.send({ success: true, data: await listMentors() });
  });

  app.put('/admin/mentors/:userId/profile', { preHandler: [authenticate, requireRole(['admin'])] }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const profile = await setMentorProfile(userId, parsed.data.coreSubject, parsed.data.strongSubjects);
    await logAudit(req, { action: 'mentor.profile_set', entityType: 'user', entityId: userId, meta: parsed.data });
    return reply.send({ success: true, data: profile });
  });

  app.put('/admin/mentors/:userId/batches', { preHandler: [authenticate, requireRole(['admin'])] }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const parsed = batchesSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } });
    }
    const result = await setMentorBatches(userId, parsed.data.batchIds);
    await logAudit(req, { action: 'mentor.batches_set', entityType: 'user', entityId: userId, meta: { count: parsed.data.batchIds.length } });
    return reply.send({ success: true, data: result });
  });

  // ── Mentor: my mapped batches ──────────────────────────────────────────────
  app.get('/mentor/my-batches', { preHandler: [authenticate] }, async (req, reply) => {
    return reply.send({ success: true, data: await getMentorBatches(req.user.sub) });
  });

  // ── Batch performance (mentor scoped / coordinator / admin) ───────────────
  app.get(
    '/admin/batches/:id/performance',
    { preHandler: [authenticate, requirePermission('students.view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = await getBatchPerformance(id, req.user.sub, req.user.role);
      return reply.send({ success: true, data });
    },
  );
}
