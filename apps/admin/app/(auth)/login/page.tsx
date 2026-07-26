'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth';
import { authApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      if ((data.user.role as string) === 'student') {
        setError('Access denied. Admin or instructor account required.');
        return;
      }
      setAuth(data.user, data.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-brand-violet flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">I</span>
          </div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Inspiro Admin</h1>
          <p className="text-slate-400 text-sm mt-1">IAS Academy LMS</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-8">
          <form onSubmit={(e) => void handleLogin(e)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <Input
                type="email"
                autoComplete="email"
                placeholder="admin@inspiroiasacademy.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-300">Password</label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-brand-violet hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-16"
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

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <Button type="submit" loading={loading} className="w-full">
              Sign in
            </Button>

            <p className="text-xs text-slate-500 text-center">
              Admin &amp; instructor access only
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
