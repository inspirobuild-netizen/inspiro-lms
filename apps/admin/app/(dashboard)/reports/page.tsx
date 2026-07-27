'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// CSV routes require a Bearer token — a plain <a href download> can't attach
// one, so we fetch authenticated and trigger the download from a Blob.
async function downloadCsv(path: string, filename: string, token: string | null) {
  const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportCard({ title, description, path, filename }: { title: string; description: string; path: string; filename: string }) {
  const { accessToken } = useAuthStore();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await downloadCsv(path, filename, accessToken);
    } catch {
      toast('Could not download this report', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={loading}
      className="text-left block w-full rounded-2xl border border-white/8 bg-surface-1 p-5 hover:bg-surface-2 transition-colors group disabled:opacity-60"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-200 group-hover:text-violet-300">{title}</p>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        {loading ? (
          <svg className="animate-spin w-5 h-5 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
      </div>
    </button>
  );
}

export default function ReportsPage() {
  const { accessToken } = useAuthStore();
  const toast = useToast();
  const [revenuePeriod, setRevenuePeriod] = useState<'daily' | 'monthly' | 'yearly'>('monthly');
  const [revLoading, setRevLoading] = useState(false);

  async function downloadRevenue() {
    setRevLoading(true);
    try {
      await downloadCsv(`/api/v1/crm/reports/revenue?period=${revenuePeriod}`, `revenue-${revenuePeriod}.csv`, accessToken);
    } catch {
      toast('Could not download this report', 'error');
    } finally {
      setRevLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Reports</h2>
        <p className="text-slate-400 text-sm mt-1">Download CSV reports for admissions and the lead pipeline</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Admissions</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ExportCard title="Admissions" description="Every admission — counsellor, branch, course, batch, fees" path="/api/v1/crm/reports/admissions" filename="admissions.csv" />
          <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
            <p className="font-medium text-slate-200 mb-2">Revenue</p>
            <p className="text-xs text-slate-500 mb-3">Daily, monthly or yearly totals</p>
            <div className="flex gap-2 mb-3">
              {(['daily', 'monthly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setRevenuePeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${revenuePeriod === p ? 'bg-brand-violet text-white' : 'bg-surface-2 text-slate-400 hover:bg-surface-high'}`}
                >{p}</button>
              ))}
            </div>
            <button onClick={() => void downloadRevenue()} disabled={revLoading} className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 hover:underline disabled:opacity-60">
              {revLoading ? 'Downloading…' : `Download ${revenuePeriod} revenue CSV →`}
            </button>
          </div>
          <ExportCard title="Student verification" description="Full approve/reject/request-changes history" path="/api/v1/crm/reports/verification" filename="verification-report.csv" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Lead pipeline</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ExportCard title="Lead source" description="Leads grouped by acquisition source" path="/api/v1/crm/reports/lead-source" filename="lead-source.csv" />
          <ExportCard title="Pending leads" description="All leads not yet converted, lost, or dropped" path="/api/v1/crm/reports/pending-leads" filename="pending-leads.csv" />
          <ExportCard title="Follow-up report" description="Leads with a scheduled next follow-up date" path="/api/v1/crm/reports/followups" filename="followup-report.csv" />
          <ExportCard title="Inactive leads (14+ days)" description="Leads with no activity in the last 2 weeks" path="/api/v1/crm/reports/inactive-leads?days=14" filename="inactive-leads.csv" />
        </div>
      </div>
    </div>
  );
}
