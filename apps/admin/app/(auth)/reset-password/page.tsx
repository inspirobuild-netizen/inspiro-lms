'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-rose-400">This reset link is missing or malformed.</p>
        <Link href="/forgot-password" className="inline-block text-sm text-brand-violet hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
          <span className="text-emerald-400 text-2xl">✓</span>
        </div>
        <p className="text-sm text-slate-300">Password updated. Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <p className="text-sm text-slate-400 leading-relaxed">Choose a new password for your account.</p>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">New password</label>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-16"
            autoFocus
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Confirm password</label>
        <Input
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <Button type="submit" loading={loading} className="w-full">
        Update password
      </Button>

      <Link href="/login" className="block text-center text-sm text-slate-500 hover:text-slate-300">
        ← Back to sign in
      </Link>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-brand-violet flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">I</span>
          </div>
          <h1 className="font-display font-bold text-2xl text-slate-100">New password</h1>
          <p className="text-slate-400 text-sm mt-1">Inspiro IAS Academy LMS</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-8">
          <Suspense fallback={<p className="text-sm text-slate-400 text-center">Loading…</p>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
