'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth';
import { authApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Step = 'phone' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  function startResendTimer(seconds: number) {
    setResendCountdown(seconds);
    const id = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{10}$/.test(phone)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.sendOtp(`91${phone}`);
      startResendTimer(data.resendAfter);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(`91${phone}`, otp);
      if ((data.user.role as string) === 'student') {
        setError('Access denied. Admin or instructor account required.');
        return;
      }
      setAuth(data.user, data.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid OTP');
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
          <p className="text-slate-400 text-sm mt-1">Civil Connect LMS</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-8">
          {step === 'phone' ? (
            <form onSubmit={(e) => void handleSendOtp(e)} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Mobile number</label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 h-10 rounded-xl bg-surface-2 border border-white/10 text-slate-400 text-sm select-none">
                    +91
                  </span>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="flex-1"
                    autoFocus
                  />
                </div>
              </div>
              {error && <p className="text-sm text-rose-400">{error}</p>}
              <Button type="submit" loading={loading} className="w-full">
                Send OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-5">
              <div>
                <p className="text-sm text-slate-400 mb-4">
                  OTP sent to <span className="text-slate-200">+91 {phone}</span>
                </p>
                <label className="block text-sm font-medium text-slate-300 mb-2">Enter OTP</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-rose-400">{error}</p>}
              <Button type="submit" loading={loading} className="w-full">
                Sign in
              </Button>
              <div className="text-center">
                {resendCountdown > 0 ? (
                  <p className="text-sm text-slate-500">Resend in {resendCountdown}s</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setOtp(''); void handleSendOtp({ preventDefault: () => {} } as React.FormEvent); }}
                    className="text-sm text-brand-violet-light hover:underline"
                  >
                    Resend OTP
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setStep('phone'); setError(null); setOtp(''); }}
                className="text-sm text-slate-500 hover:text-slate-300 block text-center w-full"
              >
                ← Change number
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
