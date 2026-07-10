'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Select, Field, Textarea } from '@/components/ui/modal';

type Exam = {
  id: string;
  title: string;
  subject: string;
  type: string;
  durationMins: number;
  negMarks: number;
  passPercent: number;
  isPublished: boolean;
};

type Question = {
  id: string;
  body: string;
  options: string[];
  correctIndex: number;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string | null;
};

export default function ExamQuestionsPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();

  const { data: examData, isError: examError, refetch } = useQuery({
    queryKey: ['admin', 'exam', id],
    queryFn: () => api.get<Exam>(`/api/v1/admin/exams/${id}`),
    enabled: !!accessToken,
  });

  const questionsKey = ['admin', 'exam', id, 'questions'];
  const { data: qData, isLoading } = useQuery({
    queryKey: questionsKey,
    queryFn: () => api.get<Question[]>(`/api/v1/admin/exams/${id}/questions?limit=200`),
    enabled: !!accessToken,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: questionsKey });
    void qc.invalidateQueries({ queryKey: ['admin', 'exam', id] });
  };

  const deleteQuestion = useMutation({
    mutationFn: (qid: string) => api.delete(`/api/v1/admin/questions/${qid}`),
    onSuccess: invalidate,
  });

  const publish = useMutation({
    mutationFn: () => api.post(`/api/v1/admin/exams/${id}/publish`),
    onSuccess: invalidate,
  });

  if (examError)
    return (
      <div className="space-y-3">
        <p className="text-rose-400">Could not load this exam.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
      </div>
    );

  const exam = examData?.data;
  const questions = qData?.data ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/exams" className="text-sm text-slate-500 hover:text-slate-300">← Exams</Link>
          <h2 className="font-display font-bold text-2xl text-slate-100 mt-1">{exam?.title ?? 'Loading…'}</h2>
          {exam && (
            <div className="flex items-center gap-2 mt-2 text-sm text-slate-400">
              <Badge variant="slate">{exam.subject}</Badge>
              <Badge variant={exam.isPublished ? 'success' : 'amber'}>{exam.isPublished ? 'Live' : 'Draft'}</Badge>
              <span>{exam.durationMins} min · −{exam.negMarks}/wrong · pass {exam.passPercent}%</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <AddQuestionButton examId={id} defaultSubject={exam?.subject ?? 'General Studies'} onAdded={invalidate} />
          {exam && !exam.isPublished && (
            <Button
              variant="outline"
              loading={publish.isPending}
              disabled={questions.length === 0}
              onClick={() => publish.mutate()}
              title={questions.length === 0 ? 'Add at least one question first' : undefined}
            >
              Publish
            </Button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-slate-400">Loading questions…</p>}

      {!isLoading && questions.length === 0 && (
        <p className="text-slate-500 text-sm rounded-2xl border border-white/8 bg-surface-1 p-6 text-center">
          No questions yet — add them manually or use “Generate with AI” from the Exams page.
        </p>
      )}

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-white/8 bg-surface-1 p-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-slate-200 text-sm leading-relaxed">
                <span className="text-slate-500 mr-2">Q{i + 1}.</span>
                {q.body}
              </p>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={q.difficulty === 'easy' ? 'teal' : q.difficulty === 'hard' ? 'rose' : 'amber'}>
                  {q.difficulty}
                </Badge>
                <button
                  className="text-xs text-rose-400/70 hover:text-rose-400"
                  onClick={() => { if (confirm('Delete this question?')) deleteQuestion.mutate(q.id); }}
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              {q.options.map((opt, oi) => (
                <div
                  key={oi}
                  className={`rounded-lg px-3 py-2 text-sm border ${
                    oi === q.correctIndex
                      ? 'border-teal-500/40 bg-teal-500/10 text-teal-200'
                      : 'border-white/5 bg-surface-2 text-slate-300'
                  }`}
                >
                  <span className="text-slate-500 mr-2">{String.fromCharCode(65 + oi)}.</span>
                  {opt}
                  {oi === q.correctIndex && <span className="ml-2 text-teal-300">✓</span>}
                </div>
              ))}
            </div>
            {q.explanation && (
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                <span className="text-slate-400 font-medium">Explanation: </span>
                {q.explanation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddQuestionButton({ examId, defaultSubject, onAdded }: { examId: string; defaultSubject: string; onAdded: () => void }) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [difficulty, setDifficulty] = useState('medium');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/admin/exams/${examId}/questions`, {
        subject: defaultSubject,
        body: body.trim(),
        options: options.map((o) => o.trim()),
        correctIndex,
        difficulty,
        ...(explanation.trim() ? { explanation: explanation.trim() } : {}),
      }),
    onSuccess: () => {
      setBody(''); setOptions(['', '', '', '']); setCorrectIndex(0); setExplanation(''); setError(null);
      onAdded();
      // keep modal open for fast consecutive entry
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add question'),
  });

  const valid = body.trim().length >= 5 && options.every((o) => o.trim().length > 0);

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Add question</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add question" description="Saves and stays open, so you can add several in a row" wide>
        <div className="space-y-4">
          <Field label="Question">
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Which article of the Constitution…" autoFocus />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((opt, i) => (
              <Field key={i} label={`Option ${String.fromCharCode(65 + i)}${i === correctIndex ? ' (correct)' : ''}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                    className="accent-teal-500 shrink-0"
                    title="Mark as the correct answer"
                  />
                  <Input
                    value={opt}
                    onChange={(e) => setOptions((prev) => prev.map((p, pi) => (pi === i ? e.target.value : p)))}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  />
                </div>
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Difficulty">
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </Field>
          </div>
          <Field label="Explanation (optional — shown after the exam)">
            <Textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Why the answer is correct…" />
          </Field>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Done</Button>
            <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
              Save & add next
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
