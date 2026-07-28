'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type GenerateResult = {
  exam: { id: string; title: string };
  questionCount: number;
};

const selectClass =
  'flex h-10 w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent';

export default function GenerateExamPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [count, setCount] = useState(10);
  const [examStyle, setExamStyle] = useState('generic');
  const [language, setLanguage] = useState('en');
  const [durationMins, setDurationMins] = useState(30);
  const [negMarks, setNegMarks] = useState(0);

  const generate = useMutation<GenerateResult, ApiError>({
    mutationFn: async () => {
      const res = await api.post<GenerateResult>('/api/v1/admin/exams/generate-ai', {
        topic, subject, difficulty, count, examStyle, language, durationMins, negMarks,
      });
      return res.data;
    },
  });

  const valid = topic.trim().length >= 3 && subject.trim().length >= 2;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">AI Exam Generator</h2>
        <p className="text-slate-400 text-sm mt-1">
          Generates a <span className="text-slate-200">draft</span> exam — review every question before publishing
        </p>
      </div>

      {generate.isSuccess ? (
        <div className="rounded-2xl bg-surface-1 border border-emerald-500/20 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-100">{generate.data.exam.title}</p>
              <p className="text-sm text-slate-400">
                {generate.data.questionCount} questions generated as an unpublished draft
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/exams">
              <Button size="sm">Review in Exams</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => generate.reset()}>
              Generate another
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface-1 border border-white/8 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Topic</label>
              <Input
                placeholder="e.g. Fundamental Rights, 1857 Revolt, Monetary Policy…"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Subject</label>
              <Input
                placeholder="e.g. Polity"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Exam style</label>
              <select className={selectClass} value={examStyle} onChange={(e) => setExamStyle(e.target.value)}>
                <option value="generic">Generic practice</option>
                <option value="upsc_prelims">UPSC Prelims</option>
                <option value="kerala_psc">Kerala PSC</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Difficulty</label>
              <select className={selectClass} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Language</label>
              <select className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">English</option>
                <option value="ml">Malayalam</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Questions (1–50)</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Duration (mins)</label>
              <Input
                type="number"
                min={5}
                max={300}
                value={durationMins}
                onChange={(e) => setDurationMins(Math.min(300, Math.max(5, Number(e.target.value) || 30)))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Negative marks per wrong answer</label>
              <Input
                type="number"
                min={0}
                max={2}
                step={0.25}
                value={negMarks}
                onChange={(e) => setNegMarks(Math.min(2, Math.max(0, Number(e.target.value) || 0)))}
              />
            </div>
          </div>

          {generate.isError && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              {generate.error.code === 'AI_UNAVAILABLE'
                ? 'The AI service is not available right now. Check that it is running and configured.'
                : generate.error.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button loading={generate.isPending} disabled={!valid} onClick={() => generate.mutate()}>
              {generate.isPending ? 'Generating…' : 'Generate draft exam'}
            </Button>
            {generate.isPending && (
              <span className="text-xs text-slate-500">This can take up to a minute for large papers</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
