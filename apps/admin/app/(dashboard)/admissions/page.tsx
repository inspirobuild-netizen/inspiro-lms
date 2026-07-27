'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore, useHasPermission } from '@/lib/auth';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatPhone } from '@/lib/utils';

type Dashboard = {
  todayLeads: number;
  pendingFollowups: number;
  admissionsToday: number;
  admissionsThisMonth: number;
  revenueThisMonth: number;
  totalLeads: number;
  conversionRate: number;
  target: { targetAdmissions: number; targetRevenue: number } | null;
  upcomingFollowups: FollowupRow[];
  missedFollowups: FollowupRow[];
};
type FollowupRow = { id: string; leadCode: string; studentName: string; phone: string; status: string; nextFollowupAt: string };

const statusLabel: Record<string, string> = {
  new: 'New', contacted: 'Contacted', interested: 'Interested', demo: 'Demo',
  counselling: 'Counselling', fee_discussion: 'Fee discussion', admission_confirmed: 'Admission confirmed',
};

export default function AdmissionsDashboardPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const has = useHasPermission();

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'dashboard'],
    queryFn: () => api.get<Dashboard>('/api/v1/crm/dashboard'),
    enabled: !!accessToken,
  });
  const d = data?.data;

  const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-100">Admission CRM</h2>
          <p className="text-slate-400 text-sm mt-1">Your leads, admissions and performance</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admissions/pipeline" className="px-4 py-2 rounded-xl border border-white/10 bg-surface-2 hover:bg-surface-high text-sm font-medium text-slate-200 transition-colors">Pipeline</Link>
          <Link href="/admissions/leads" className="px-4 py-2 rounded-xl bg-brand-violet hover:bg-brand-violet/90 text-sm font-medium text-white transition-colors">Leads</Link>
          {has('analytics.view_all') && (
            <Link href="/admissions/analytics" className="px-4 py-2 rounded-xl border border-white/10 bg-surface-2 hover:bg-surface-high text-sm font-medium text-slate-200 transition-colors">Analytics</Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's leads" value={isLoading ? '…' : d?.todayLeads ?? 0} accent="violet" />
        <StatCard label="Pending follow-ups" value={isLoading ? '…' : d?.pendingFollowups ?? 0} accent="amber" />
        <StatCard label="Admissions today" value={isLoading ? '…' : d?.admissionsToday ?? 0} accent="teal" />
        <StatCard label="Admissions this month" value={isLoading ? '…' : d?.admissionsThisMonth ?? 0} accent="teal" />
        <StatCard label="Conversion rate" value={isLoading ? '…' : `${d?.conversionRate ?? 0}%`} accent="violet" />
        <StatCard label="Revenue this month" value={isLoading ? '…' : money(d?.revenueThisMonth ?? 0)} accent="rose" />
        <StatCard label="Total leads" value={isLoading ? '…' : d?.totalLeads ?? 0} accent="violet" />
        {d?.target && (
          <StatCard
            label="Target progress"
            value={`${d.admissionsThisMonth}/${d.target.targetAdmissions}`}
            sub={`Revenue target ${money(d.target.targetRevenue)}`}
            accent="amber"
          />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <FollowupList title="Missed follow-ups" empty="No missed follow-ups 🎉" rows={d?.missedFollowups ?? []} tone="rose" />
        <FollowupList title="Upcoming follow-ups" empty="Nothing scheduled" rows={d?.upcomingFollowups ?? []} tone="teal" />
      </div>
    </div>
  );
}

function FollowupList({ title, empty, rows, tone }: { title: string; empty: string; rows: FollowupRow[]; tone: 'rose' | 'teal' }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5">
      <h3 className="font-semibold text-slate-200 mb-3 text-sm">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link key={r.id} href={`/admissions/leads/${r.id}`} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-high transition-colors">
              <div>
                <p className="text-sm font-medium text-slate-200">{r.studentName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.leadCode} · {formatPhone(r.phone)}</p>
              </div>
              <div className="text-right">
                <Badge variant={tone === 'rose' ? 'rose' : 'teal'}>{statusLabel[r.status] ?? r.status}</Badge>
                <p className="text-xs text-slate-500 mt-1">{formatDate(r.nextFollowupAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
