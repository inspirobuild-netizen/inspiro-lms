'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { StatCard } from '@/components/shared/stat-card';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';

type Overview = {
  totals: { leads: number; admissions: number; revenue: number; collected: number; conversionRate: number };
  funnel: Record<string, number>;
  sources: { source: string; count: number }[];
  trend: { month: string; admissions: number; revenue: number }[];
  counsellorPerformance: { counsellorId: string; counsellorName: string; admissions: number; revenue: number; leads: number; conversionRate: number }[];
  courseWise: { name: string; count: number }[];
  branchWise: { name: string; count: number }[];
};

const CHART_COLORS = { violet: '#7C3AED', teal: '#4FDBC8', amber: '#F59E0B', rose: '#E11D48' };
const PIE_COLORS = ['#7C3AED', '#4FDBC8', '#F59E0B', '#E11D48', '#38BDF8', '#A3E635', '#F472B6', '#FB923C'];

const FUNNEL_ORDER = ['new', 'contacted', 'interested', 'demo', 'counselling', 'fee_discussion', 'admission_confirmed', 'converted'];
const funnelLabel: Record<string, string> = {
  new: 'New', contacted: 'Contacted', interested: 'Interested', demo: 'Demo', counselling: 'Counselling',
  fee_discussion: 'Fee discussion', admission_confirmed: 'Admission confirmed', converted: 'Joined batch',
};

export default function CrmAnalyticsPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'analytics'],
    queryFn: () => api.get<Overview>('/api/v1/crm/analytics'),
    enabled: !!accessToken,
  });
  const d = data?.data;

  const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const funnelData = FUNNEL_ORDER.map((k) => ({ stage: funnelLabel[k], count: d?.funnel[k] ?? 0 }));

  const perfColumns: Column<Overview['counsellorPerformance'][number]>[] = [
    { key: 'name', header: 'Counsellor', render: (r) => <span className="font-medium text-slate-200">{r.counsellorName}</span> },
    { key: 'leads', header: 'Leads', width: 'w-20', render: (r) => <span className="text-slate-400">{r.leads}</span> },
    { key: 'admissions', header: 'Admissions', width: 'w-24', render: (r) => <span className="text-slate-300">{r.admissions}</span> },
    { key: 'conversion', header: 'Conversion', width: 'w-24', render: (r) => <Badge variant={r.conversionRate >= 50 ? 'success' : 'default'}>{r.conversionRate}%</Badge> },
    { key: 'revenue', header: 'Revenue', width: 'w-32', render: (r) => <span className="text-slate-200">{money(r.revenue)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">CRM Analytics</h2>
        <p className="text-slate-400 text-sm mt-1">Admissions performance across all counsellors and branches</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total leads" value={isLoading ? '…' : d?.totals.leads ?? 0} accent="violet" />
        <StatCard label="Total admissions" value={isLoading ? '…' : d?.totals.admissions ?? 0} accent="teal" />
        <StatCard label="Conversion rate" value={isLoading ? '…' : `${d?.totals.conversionRate ?? 0}%`} accent="violet" />
        <StatCard label="Revenue (recorded)" value={isLoading ? '…' : money(d?.totals.revenue ?? 0)} accent="rose" />
        <StatCard label="Collected" value={isLoading ? '…' : money(d?.totals.collected ?? 0)} accent="amber" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Admission funnel */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
          <h3 className="font-semibold text-slate-200 mb-4 text-sm">Admission funnel</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis type="category" dataKey="stage" width={110} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1A1F3A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill={CHART_COLORS.violet} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lead source breakdown */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
          <h3 className="font-semibold text-slate-200 mb-4 text-sm">Lead source</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={d?.sources ?? []} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.source} (${e.count})`}>
                {(d?.sources ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1A1F3A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Admission trend (6 months) */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-5 lg:col-span-2">
          <h3 className="font-semibold text-slate-200 mb-4 text-sm">Admission trend (6 months)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={d?.trend ?? []}>
              <defs>
                <linearGradient id="admGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.teal} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={CHART_COLORS.teal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1A1F3A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="admissions" stroke={CHART_COLORS.teal} fill="url(#admGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Course-wise */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
          <h3 className="font-semibold text-slate-200 mb-4 text-sm">Course-wise admissions</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d?.courseWise ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1A1F3A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill={CHART_COLORS.amber} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Branch-wise */}
        <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
          <h3 className="font-semibold text-slate-200 mb-4 text-sm">Branch-wise admissions</h3>
          {(d?.branchWise ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No branch-linked admissions yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d?.branchWise ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1A1F3A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill={CHART_COLORS.rose} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Counsellor performance table */}
      <div>
        <h3 className="font-semibold text-slate-200 mb-3 text-sm">Counsellor performance</h3>
        <DataTable columns={perfColumns} data={d?.counsellorPerformance ?? []} loading={isLoading} getKey={(r) => r.counsellorId} emptyMessage="No counsellor activity yet" />
      </div>
    </div>
  );
}
