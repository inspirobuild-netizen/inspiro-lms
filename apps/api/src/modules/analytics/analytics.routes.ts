import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import {
  getOverviewStats,
  getEnrollmentTrend,
  getExamPerformanceByBatch,
  getLessonCompletionByCourse,
  getTopStudents,
  getLiveClassStats,
  exportStudentsCsv,
  exportExamResultsCsv,
  exportAttendanceCsv,
} from './analytics.service.js';

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

const batchFilterSchema = z.object({
  batchId: z.string().uuid().optional(),
});

const examFilterSchema = z.object({
  examId: z.string().uuid().optional(),
});

const topStudentsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function analyticsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireRole(['admin', 'instructor'])] };

  // ── JSON analytics endpoints ───────────────────────────────────────────────

  app.get('/admin/analytics/overview', guard, async (_req, reply) => {
    const data = await getOverviewStats();
    return reply.send({ success: true, data });
  });

  app.get('/admin/analytics/enrollment-trend', guard, async (_req, reply) => {
    const data = await getEnrollmentTrend();
    return reply.send({ success: true, data });
  });

  app.get('/admin/analytics/exam-performance', guard, async (req, reply) => {
    const input = validate(batchFilterSchema, req.query, reply);
    if (!input) return;
    const data = await getExamPerformanceByBatch(input.batchId);
    return reply.send({ success: true, data });
  });

  app.get('/admin/analytics/lesson-completion', guard, async (_req, reply) => {
    const data = await getLessonCompletionByCourse();
    return reply.send({ success: true, data });
  });

  app.get('/admin/analytics/top-students', guard, async (req, reply) => {
    const input = validate(topStudentsSchema, req.query, reply);
    if (!input) return;
    const data = await getTopStudents(input.limit);
    return reply.send({ success: true, data });
  });

  app.get('/admin/analytics/live-classes', guard, async (req, reply) => {
    const input = validate(batchFilterSchema, req.query, reply);
    if (!input) return;
    const data = await getLiveClassStats(input.batchId);
    return reply.send({ success: true, data });
  });

  // ── CSV export endpoints ───────────────────────────────────────────────────

  app.get('/admin/analytics/export/students', guard, async (req, reply) => {
    const input = validate(batchFilterSchema, req.query, reply);
    if (!input) return;
    const csv = await exportStudentsCsv(input.batchId);
    const filename = input.batchId ? `students-batch-${input.batchId.slice(0, 8)}.csv` : 'students-all.csv';
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });

  app.get('/admin/analytics/export/exam-results', guard, async (req, reply) => {
    const input = validate(examFilterSchema, req.query, reply);
    if (!input) return;
    const csv = await exportExamResultsCsv(input.examId);
    const filename = input.examId ? `exam-results-${input.examId.slice(0, 8)}.csv` : 'exam-results-all.csv';
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });

  app.get('/admin/analytics/export/attendance', guard, async (req, reply) => {
    const input = validate(batchFilterSchema, req.query, reply);
    if (!input) return;
    const csv = await exportAttendanceCsv(input.batchId);
    const filename = input.batchId ? `attendance-batch-${input.batchId.slice(0, 8)}.csv` : 'attendance-all.csv';
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });
}
