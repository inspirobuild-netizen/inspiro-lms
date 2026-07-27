'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { DataTable, Pagination, type Column } from '@/components/shared/data-table';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';

type AuditRow = {
  id: string; action: string; entityType: string; entityId: string | null;
  ipAddress: string | null; meta: Record<string, unknown> | null; createdAt: string; actorName: string | null;
};

export default function AuditLogPage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [debounced, setDebounced] = useState('');
  const limit = 50;

  function onSearch(v: string) {
    setAction(v);
    clearTimeout((onSearch as { t?: ReturnType<typeof setTimeout> }).t);
    (onSearch as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => { setDebounced(v); setPage(1); }, 400);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', page, debounced],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (debounced) p.set('action', debounced);
      return api.get<AuditRow[]>(`/api/v1/admin/audit-logs?${p.toString()}`);
    },
    enabled: !!accessToken,
  });

  const columns: Column<AuditRow>[] = [
    { key: 'action', header: 'Action', width: 'w-52', render: (r) => <span className="font-mono text-xs text-violet-300">{r.action}</span> },
    { key: 'entity', header: 'Entity', width: 'w-40', render: (r) => <span className="text-slate-400">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}</span> },
    { key: 'actor', header: 'Actor', width: 'w-40', render: (r) => <span className="text-slate-300">{r.actorName ?? 'System'}</span> },
    { key: 'ip', header: 'IP', width: 'w-32', render: (r) => <span className="text-slate-500 text-xs">{r.ipAddress ?? '—'}</span> },
    { key: 'when', header: 'When', width: 'w-40', render: (r) => <span className="text-slate-400">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Audit Log</h2>
        <p className="text-slate-400 text-sm mt-1">{data?.meta?.total ?? 0} recorded actions</p>
      </div>

      <Input placeholder="Filter by action (e.g. staff.created)…" value={action} onChange={(e) => onSearch(e.target.value)} className="max-w-xs" />

      <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} getKey={(r) => r.id} emptyMessage="No audit entries" />
      <Pagination page={page} limit={limit} total={data?.meta?.total ?? 0} onPage={setPage} />
    </div>
  );
}
