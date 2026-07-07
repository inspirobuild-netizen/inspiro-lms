import { z } from 'zod';

export const createDoubtSchema = z.object({
  subject: z.string().min(2).max(100),
  body: z.string().min(3).max(2000),
  imageUrl: z.string().url().max(500).optional(),
  language: z.enum(['en', 'ml']).default('en'),
});
export type CreateDoubtInput = z.infer<typeof createDoubtSchema>;

export const listDoubtsSchema = z.object({
  status: z.enum(['open', 'ai_answered', 'escalated', 'resolved']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListDoubtsInput = z.infer<typeof listDoubtsSchema>;

export const answerDoubtSchema = z.object({
  answer: z.string().min(3).max(5000),
});
export type AnswerDoubtInput = z.infer<typeof answerDoubtSchema>;

export const doubtIdParamSchema = z.object({
  id: z.string().uuid(),
});
