import { logger } from './logger.js';

/**
 * Client for the internal Python AI service (apps/ai).
 * Auth is a shared secret header — the AI service is never public.
 */

const AI_TIMEOUT_MS = 60_000;

export class AiUnavailableError extends Error {
  constructor(message = 'AI service unavailable') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export interface AiDoubtResult {
  answer: string;
  confidence: number;
  escalate: boolean;
  sources: string[];
}

export interface AiGeneratedQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface AiExamResult {
  topic: string;
  questions: AiGeneratedQuestion[];
}

export interface AiSummaryResult {
  summary: string;
  exam_relevance: string;
  tags: string[];
  mcqs: AiGeneratedQuestion[];
}

function aiConfig(): { baseUrl: string; key: string } | null {
  const baseUrl = process.env['AI_SERVICE_URL'];
  const key = process.env['AI_INTERNAL_KEY'];
  if (!baseUrl || !key) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), key };
}

export function aiEnabled(): boolean {
  return aiConfig() !== null;
}

async function aiPost<T>(path: string, body: unknown): Promise<T> {
  const config = aiConfig();
  if (!config) throw new AiUnavailableError('AI service not configured');

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-key': config.key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error({ err, path }, 'AI service request failed');
    throw new AiUnavailableError();
  }

  if (!res.ok) {
    logger.error({ path, status: res.status }, 'AI service returned error');
    throw new AiUnavailableError(`AI service returned ${res.status}`);
  }

  return (await res.json()) as T;
}

export async function aiEmbed(texts: string[]): Promise<number[][]> {
  const res = await aiPost<{ vectors: number[][]; dim: number }>('/ai/embeddings', { texts });
  return res.vectors;
}

export async function aiResolveDoubt(input: {
  question: string;
  subject?: string;
  context?: { source: string; text: string }[];
  language?: 'en' | 'ml';
}): Promise<AiDoubtResult> {
  return aiPost<AiDoubtResult>('/ai/doubts/resolve', input);
}

export async function aiGenerateExam(input: {
  topic: string;
  subject: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
  exam_style?: 'upsc_prelims' | 'kerala_psc' | 'generic';
  language?: 'en' | 'ml';
}): Promise<AiExamResult> {
  return aiPost<AiExamResult>('/ai/exams/generate', input);
}

export interface AiCoachPlan {
  strengths: string[];
  weaknesses: string[];
  weekly_plan: { day: string; focus: string; tasks: string[] }[];
  at_risk: boolean;
  motivation: string;
}

export async function aiCoachPlan(input: {
  subjects: { subject: string; attempts: number; avg_percent: number; last_percent: number }[];
  streak_days: number;
  study_minutes_last_30d: number;
  lessons_completed_last_30d: number;
  target_exam?: 'upsc' | 'kerala_psc' | 'generic';
  language?: 'en' | 'ml';
}): Promise<AiCoachPlan> {
  return aiPost<AiCoachPlan>('/ai/coach/plan', input);
}

export interface AiContentTags {
  tags: string[];
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export async function aiTagContent(input: {
  text: string;
  kind?: 'question' | 'lesson' | 'article';
}): Promise<AiContentTags> {
  return aiPost<AiContentTags>('/ai/content/tag', input);
}

export interface AiMonthlyReport {
  narrative: string;
  highlights: string[];
  concerns: string[];
  recommendations: string[];
}

export async function aiMonthlyReport(input: {
  batch_name: string;
  month: string; // YYYY-MM
  enrolled_students: number;
  active_students: number;
  attendance_percent: number;
  subject_averages: { subject: string; avg_percent: number; attempts: number }[];
  exams_conducted: number;
}): Promise<AiMonthlyReport> {
  return aiPost<AiMonthlyReport>('/ai/content/monthly-report', input);
}

export async function aiSummarizeArticle(input: {
  title: string;
  body: string;
  generate_mcqs?: boolean;
}): Promise<AiSummaryResult> {
  return aiPost<AiSummaryResult>('/ai/current-affairs/summarize', input);
}
