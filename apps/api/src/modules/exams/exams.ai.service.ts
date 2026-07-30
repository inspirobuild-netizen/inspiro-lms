import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { exams, questions } from '../../../drizzle/schema.js';
import { aiGenerateExam, aiTagContent } from '../../lib/ai-client.js';

export const generateAiExamSchema = z.object({
  topic: z.string().min(3).max(200),
  subject: z.string().min(2).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  count: z.coerce.number().int().min(1).max(50).default(10),
  examStyle: z.enum(['upsc_prelims', 'kerala_psc', 'generic']).default('generic'),
  language: z.enum(['en', 'ml']).default('en'),
  durationMins: z.coerce.number().int().min(5).max(300).default(30),
  negMarks: z.coerce.number().min(0).max(2).default(0),
  // When set, the generated exam becomes a topic_quiz tied to this lesson.
  lessonId: z.string().uuid().optional(),
});
export type GenerateAiExamInput = z.infer<typeof generateAiExamSchema>;

/**
 * Generate a draft (unpublished) exam via the AI service.
 * Admin reviews/edits questions in the dashboard before publishing —
 * AI output never goes straight to students.
 */
export async function generateExamWithAi(input: GenerateAiExamInput, createdBy: string) {
  const result = await aiGenerateExam({
    topic: input.topic,
    subject: input.subject,
    difficulty: input.difficulty,
    count: input.count,
    exam_style: input.examStyle,
    language: input.language,
  });

  const [exam] = await db
    .insert(exams)
    .values({
      title: `${input.topic} — AI Draft`,
      subject: input.subject,
      type: input.lessonId ? 'topic_quiz' : 'practice',
      lessonId: input.lessonId,
      durationMins: input.durationMins,
      negMarks: input.negMarks,
      isPublished: false,
      createdBy,
    })
    .returning();
  if (!exam) throw new Error('Failed to create exam');

  const rows = result.questions.map((q) => ({
    examId: exam.id,
    subject: input.subject,
    chapter: input.topic,
    difficulty: q.difficulty,
    body: q.question,
    options: q.options,
    correctIndex: q.correct_index,
    explanation: q.explanation,
    tags: ['ai_generated'],
  }));
  const inserted = await db.insert(questions).values(rows).returning({ id: questions.id });

  return { exam, questionCount: inserted.length };
}

export class QuestionNotFoundError extends Error {}

/** AI-classify a question: refresh its tags, subject and difficulty. */
export async function autoTagQuestion(questionId: string) {
  const [q] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!q) throw new QuestionNotFoundError('Question not found');

  const result = await aiTagContent({
    text: `${q.body}\nOptions: ${q.options.join(' | ')}`,
    kind: 'question',
  });

  const [updated] = await db
    .update(questions)
    .set({
      tags: result.tags,
      subject: result.subject,
      difficulty: result.difficulty,
    })
    .where(eq(questions.id, questionId))
    .returning();

  return updated!;
}
