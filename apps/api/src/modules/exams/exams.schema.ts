import { z } from 'zod';

// ── Exam ──────────────────────────────────────────────────────────────────────
export const createExamSchema = z.object({
  title: z.string().min(2).max(255),
  subject: z.string().min(1).max(100),
  type: z.enum(['practice', 'chapter', 'mock', 'previous_year', 'topic_quiz']).default('practice'),
  durationMins: z.number().int().positive().max(480),
  negMarks: z.number().min(0).max(4).default(0.25),
  passPercent: z.number().min(0).max(100).default(40),
  maxAttempts: z.number().int().positive().max(10).default(1),
  scheduleStart: z.string().datetime().optional(),
  scheduleEnd: z.string().datetime().optional(),
  batchIds: z.array(z.string().uuid()).optional(),
  // Set when type='topic_quiz' — the lesson/class this quiz follows.
  lessonId: z.string().uuid().optional(),
});

export const updateExamSchema = createExamSchema.partial();

// ── Questions ─────────────────────────────────────────────────────────────────
export const createQuestionSchema = z.object({
  subject: z.string().min(1).max(100),
  chapter: z.string().max(255).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  body: z.string().min(5),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().optional(),
  imageUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateQuestionSchema = createQuestionSchema.partial();

export const bulkImportQuestionsSchema = z.object({
  questions: z.array(createQuestionSchema).min(1).max(500),
});

// ── Attempt ───────────────────────────────────────────────────────────────────
export const submitExamSchema = z.object({
  // Map of questionId → chosen option index (0–3), absent = skipped
  answers: z.record(z.string().uuid(), z.number().int().min(0).max(3)),
  isAutoSubmitted: z.boolean().default(false),
  tabSwitchCount: z.number().int().nonnegative().default(0),
});

export const flagTabSwitchSchema = z.object({
  count: z.number().int().positive(),
});

// ── List / filter ─────────────────────────────────────────────────────────────
export const listExamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  subject: z.string().optional(),
  type: z.enum(['practice', 'chapter', 'mock', 'previous_year', 'topic_quiz']).optional(),
  batchId: z.string().uuid().optional(),
  lessonId: z.string().uuid().optional(),
});

export const listQuestionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  subject: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  chapter: z.string().optional(),
});

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type SubmitExamInput = z.infer<typeof submitExamSchema>;
export type ListExamsInput = z.infer<typeof listExamsSchema>;
export type ListQuestionsInput = z.infer<typeof listQuestionsSchema>;
