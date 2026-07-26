'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-brand-violet flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">I</span>
          </div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Reset password</h1>
          <p className="text-slate-400 text-sm mt-1">Inspiro IAS Academy LMS</p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-surface-1 p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                <span className="text-emerald-400 text-2xl">✓</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                If an account exists for <span className="text-slate-100 font-medium">{email}</span>, a
                password-reset link is on its way. It expires in 30 minutes.
              </p>
              <p className="text-xs text-slate-500">Check your inbox (and spam folder).</p>
              <Link href="/login" className="inline-block text-sm text-brand-violet hover:underline">
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              <p className="text-sm text-slate-400 leading-relaxed">
                Enter your account email and we&apos;ll send you a link to reset your password.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-rose-400">{error}</p>}

              <Button type="submit" loading={loading} className="w-full">
                Send reset link
              </Button>

              <Link
                href="/login"
                className="block text-center text-sm text-slate-500 hover:text-slate-300"
              >
                ← Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
