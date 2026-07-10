import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import {
  createExamSchema,
  updateExamSchema,
  createQuestionSchema,
  bulkImportQuestionsSchema,
  updateQuestionSchema,
  submitExamSchema,
  flagTabSwitchSchema,
  listExamsSchema,
  listQuestionsSchema,
} from './exams.schema.js';
import {
  listAllExams,
  getExamById,
  createExam,
  updateExam,
  publishExam,
  deleteExam,
  addQuestion,
  bulkImportQuestions,
  updateQuestion,
  deleteQuestion,
  listQuestions,
  getExamAnalytics,
  listAvailableExams,
  startExam,
  submitExam,
  getExamResult,
  getMyAttempts,
  flagTabSwitch,
} from './exams.service.js';
import { generateAiExamSchema, generateExamWithAi, autoTagQuestion, QuestionNotFoundError } from './exams.ai.service.js';
import { AiUnavailableError } from '../../lib/ai-client.js';

type ZodSchema<T> = {
  safeParse: (v: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { flatten: () => unknown } };
};

function validate<T>(schema: ZodSchema<T>, value: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    void reply.status(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() },
    });
    return null;
  }
  return r.data;
}

const pageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function examsRoutes(app: FastifyInstance) {
  // ══ Student routes ════════════════════════════════════════════════════════

  // List available exams (filtered to student's batches + practice)
  app.get('/exams', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(listExamsSchema, req.query, reply);
    if (!input) return;
    const result = await listAvailableExams(req.user.sub, input);
    return reply.send({ success: true, data: result.items, meta: { page: input.page, limit: input.limit, total: result.total } });
  });

  // My attempt history
  app.get('/exams/attempts', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = pageSchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    const { page, limit } = parsed.data;
    const result = await getMyAttempts(req.user.sub, page, limit);
    return reply.send({ success: true, data: result.items, meta: { page, limit, total: result.total } });
  });

  // Start exam — creates or resumes an attempt
  app.post('/exams/:id/start', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await startExam(id, req.user.sub);
    return reply.status(result.resumed ? 200 : 201).send({ success: true, data: result });
  });

  // Submit exam
  app.post('/exams/:id/attempts/:attemptId/submit', { preHandler: [authenticate] }, async (req, reply) => {
    const { id, attemptId } = req.params as { id: string; attemptId: string };
    const input = validate(submitExamSchema, req.body, reply);
    if (!input) return;
    const result = await submitExam(id, attemptId, req.user.sub, input);
    return reply.send({ success: true, data: result });
  });

  // Get result (requires completed attempt)
  app.get('/exams/:id/result', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await getExamResult(id, req.user.sub);
    return reply.send({ success: true, data: result });
  });

  // Flag tab switch (called by Flutter on visibilitychange)
  app.post(
    '/exams/attempts/:attemptId/tab-switch',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { attemptId } = req.params as { attemptId: string };
      const input = validate(flagTabSwitchSchema, req.body, reply);
      if (!input) return;
      const result = await flagTabSwitch(attemptId, req.user.sub, input.count);
      return reply.send({ success: true, data: result });
    },
  );

  // ══ Admin routes ══════════════════════════════════════════════════════════

  // List all exams (admin view — no filtering by enrollment)
  app.get(
    '/admin/exams',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const input = validate(listExamsSchema, req.query, reply);
      if (!input) return;
      const result = await listAllExams(input);
      return reply.send({ success: true, data: result.items, meta: { page: input.page, limit: input.limit, total: result.total } });
    },
  );

  // Create exam
  app.post(
    '/admin/exams',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const input = validate(createExamSchema, req.body, reply);
      if (!input) return;
      const exam = await createExam(input, req.user.sub);
      return reply.status(201).send({ success: true, data: exam });
    },
  );

  // Generate a draft exam with AI (admin reviews before publishing)
  app.post(
    '/admin/exams/generate-ai',
    {
      preHandler: [authenticate, requireRole(['admin', 'instructor'])],
      config: {
        // LLM generation is slow and metered
        rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: (req) => `ai-exam:${(req as { user?: { sub: string } }).user?.sub ?? req.ip}` },
      },
    },
    async (req, reply) => {
      const input = validate(generateAiExamSchema, req.body, reply);
      if (!input) return;
      try {
        const result = await generateExamWithAi(input, req.user.sub);
        return reply.status(201).send({ success: true, data: result });
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          return reply.status(503).send({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'AI service is not available right now' } });
        }
        throw err;
      }
    },
  );

  // Get single exam (admin)
  app.get(
    '/admin/exams/:id',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const exam = await getExamById(id);
      return reply.send({ success: true, data: exam });
    },
  );

  // Update exam
  app.patch(
    '/admin/exams/:id',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(updateExamSchema, req.body, reply);
      if (!input) return;
      const exam = await updateExam(id, input);
      return reply.send({ success: true, data: exam });
    },
  );

  // Publish exam (requires ≥1 question)
  app.post(
    '/admin/exams/:id/publish',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const exam = await publishExam(id);
      return reply.send({ success: true, data: exam });
    },
  );

  // Delete exam
  app.delete(
    '/admin/exams/:id',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteExam(id);
      return reply.send({ success: true, data: result });
    },
  );

  // Exam analytics
  app.get(
    '/admin/exams/:id/analytics',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const analytics = await getExamAnalytics(id);
      return reply.send({ success: true, data: analytics });
    },
  );

  // ── Question bank ──────────────────────────────────────────────────────────

  // List questions for an exam
  app.get(
    '/admin/exams/:id/questions',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(listQuestionsSchema, req.query, reply);
      if (!input) return;
      const result = await listQuestions(id, input);
      return reply.send({ success: true, data: result.items, meta: { page: input.page, limit: input.limit, total: result.total } });
    },
  );

  // Add single question
  app.post(
    '/admin/exams/:id/questions',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(createQuestionSchema, req.body, reply);
      if (!input) return;
      const q = await addQuestion(id, input);
      return reply.status(201).send({ success: true, data: q });
    },
  );

  // Bulk import questions
  app.post(
    '/admin/exams/:id/questions/bulk',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(bulkImportQuestionsSchema, req.body, reply);
      if (!input) return;
      const result = await bulkImportQuestions(id, input.questions);
      return reply.send({ success: true, data: result });
    },
  );

  // Update question
  app.patch(
    '/admin/questions/:id',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(updateQuestionSchema, req.body, reply);
      if (!input) return;
      const q = await updateQuestion(id, input);
      return reply.send({ success: true, data: q });
    },
  );

  // AI auto-tag a question (refreshes tags, subject, difficulty)
  app.post(
    '/admin/questions/:id/auto-tag',
    {
      preHandler: [authenticate, requireRole(['admin', 'instructor'])],
      config: {
        rateLimit: { max: 60, timeWindow: '1 hour', keyGenerator: (req) => `ai-tag:${(req as { user?: { sub: string } }).user?.sub ?? req.ip}` },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const q = await autoTagQuestion(id);
        return reply.send({ success: true, data: q });
      } catch (err) {
        if (err instanceof QuestionNotFoundError) {
          return reply.status(404).send({ success: false, error: { code: 'QUESTION_NOT_FOUND', message: 'Question not found' } });
        }
        if (err instanceof AiUnavailableError) {
          return reply.status(503).send({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'AI service is not available right now' } });
        }
        throw err;
      }
    },
  );

  // Delete question
  app.delete(
    '/admin/questions/:id',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteQuestion(id);
      return reply.send({ success: true, data: result });
    },
  );
}
