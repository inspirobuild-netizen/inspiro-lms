import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoleOrPermission } from '../../middleware/require-permission.js';
import {
  createBatchSchema,
  updateBatchSchema,
  enrollStudentSchema,
  bulkEnrollSchema,
  assignInstructorSchema,
  listBatchesSchema,
} from './batches.schema.js';
import {
  listBatches,
  getBatchById,
  createBatch,
  updateBatch,
  archiveBatch,
  enrollStudent,
  bulkEnrollStudents,
  unenrollStudent,
  getBatchStudents,
  assignInstructor,
  removeInstructor,
  getMyBatches,
} from './batches.service.js';
import { z } from 'zod';

const pageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function batchesRoutes(app: FastifyInstance) {
  // ── Student: my batches ────────────────────────────────────────────────────
  app.get('/batches/my', { preHandler: [authenticate] }, async (req, reply) => {
    const data = await getMyBatches(req.user.sub);
    return reply.send({ success: true, data });
  });

  // ── Public-ish: list batches (authenticated) ───────────────────────────────
  app.get('/batches', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = listBatchesSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.flatten() },
      });
    }
    const { items, total } = await listBatches(parsed.data);
    const { page, limit } = parsed.data;
    return reply.send({ success: true, data: items, meta: { page, limit, total } });
  });

  // ── Get batch detail ───────────────────────────────────────────────────────
  app.get('/batches/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const batch = await getBatchById(id);
    return reply.send({ success: true, data: batch });
  });

  // ── Admin: create batch ────────────────────────────────────────────────────
  app.post(
    '/admin/batches',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (req, reply) => {
      const parsed = createBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid batch data', details: parsed.error.flatten() },
        });
      }
      const batch = await createBatch(parsed.data);
      return reply.status(201).send({ success: true, data: batch });
    },
  );

  // ── Admin: update batch ────────────────────────────────────────────────────
  app.patch(
    '/admin/batches/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid batch data', details: parsed.error.flatten() },
        });
      }
      const batch = await updateBatch(id, parsed.data);
      return reply.send({ success: true, data: batch });
    },
  );

  // ── Admin: archive batch ───────────────────────────────────────────────────
  app.delete(
    '/admin/batches/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const batch = await archiveBatch(id);
      return reply.send({ success: true, data: batch });
    },
  );

  // ── Admin: get enrolled students ───────────────────────────────────────────
  app.get(
    '/admin/batches/:id/students',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'batches.view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = pageSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query' },
        });
      }
      const { items, total } = await getBatchStudents(id, parsed.data.page, parsed.data.limit);
      return reply.send({ success: true, data: items, meta: { page: parsed.data.page, limit: parsed.data.limit, total } });
    },
  );

  // ── Admin: enroll single student ───────────────────────────────────────────
  app.post(
    '/admin/batches/:id/enroll',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = enrollStudentSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid enrollment data', details: parsed.error.flatten() },
        });
      }
      const enrollment = await enrollStudent(id, parsed.data.userId, parsed.data.expiresAt);
      return reply.status(201).send({ success: true, data: enrollment });
    },
  );

  // ── Admin: bulk enroll ─────────────────────────────────────────────────────
  app.post(
    '/admin/batches/:id/enroll/bulk',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = bulkEnrollSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid bulk enrollment data', details: parsed.error.flatten() },
        });
      }
      const result = await bulkEnrollStudents(id, parsed.data.userIds, parsed.data.expiresAt);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Admin: unenroll student ────────────────────────────────────────────────
  app.delete(
    '/admin/batches/:id/students/:userId',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (req, reply) => {
      const { id, userId } = req.params as { id: string; userId: string };
      const result = await unenrollStudent(id, userId);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Admin: assign instructor ───────────────────────────────────────────────
  app.post(
    '/admin/batches/:id/instructors',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = assignInstructorSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid instructor id', details: parsed.error.flatten() },
        });
      }
      const result = await assignInstructor(id, parsed.data.instructorId);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Admin: remove instructor ───────────────────────────────────────────────
  app.delete(
    '/admin/batches/:id/instructors/:instructorId',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (req, reply) => {
      const { id, instructorId } = req.params as { id: string; instructorId: string };
      const result = await removeInstructor(id, instructorId);
      return reply.send({ success: true, data: result });
    },
  );
}
