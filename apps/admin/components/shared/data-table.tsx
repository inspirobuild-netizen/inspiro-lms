import { cn } from '@/lib/utils';

export type Column<T> = {
  key: string;
  header: string;
  width?: string;
  render: (row: T) => React.ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  getKey: (row: T) => string;
};

export function DataTable<T>({ columns, data, loading, emptyMessage = 'No data', getKey }: DataTableProps<T>) {
  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn('px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide', col.width)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                <div className="flex justify-center">
                  <svg className="animate-spin h-6 w-6 text-brand-violet" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={getKey(row)} className="border-b border-white/5 hover:bg-surface-2 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 text-slate-300', col.width)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// Simple pagination controls
type PaginationProps = {
  page: number;
  limit: number;
  total: number;
  onPage: (p: number) => void;
};

export function Pagination({ page, limit, total, onPage }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
      <p>
        Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-lg border border-white/10 bg-surface-2 disabled:opacity-40 hover:bg-surface-high transition-colors"
        >
          ← Prev
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-lg border border-white/10 bg-surface-2 disabled:opacity-40 hover:bg-surface-high transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
