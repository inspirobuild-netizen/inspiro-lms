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

const Spinner = () => (
  <div className="flex justify-center">
    <svg className="animate-spin h-6 w-6 text-brand-violet" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  </div>
);

/**
 * Below `sm`, a fixed-width table forces horizontal scrolling on every list
 * in the app — that reads as broken on a phone, not just cramped. So on
 * small screens each row renders as a stacked card instead: the first column
 * (always the row's "identity" — name + subtitle, usually a link) stays
 * full-width and unlabelled like a card title; columns with no header (row
 * actions) render full-width too; everything else becomes a label/value line.
 * `sm:` and up render the familiar table, still horizontally scrollable
 * within its own box as a safety net for very wide tables on small tablets.
 */
export function DataTable<T>({ columns, data, loading, emptyMessage = 'No data', getKey }: DataTableProps<T>) {
  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1">
      <div className="sm:hidden">
        {loading ? (
          <div className="px-4 py-12">
            <Spinner />
          </div>
        ) : data.length === 0 ? (
          <div className="px-4 py-12 text-center text-slate-500 text-sm">{emptyMessage}</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {data.map((row) => (
              <li key={getKey(row)} className="px-4 py-3.5 space-y-2">
                {columns.map((col, i) => {
                  const content = col.render(row);
                  if (i === 0 || !col.header) {
                    return (
                      <div key={col.key} className="min-w-0">
                        {content}
                      </div>
                    );
                  }
                  return (
                    <div key={col.key} className="flex items-center justify-between gap-3 text-sm min-w-0">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide shrink-0">{col.header}</span>
                      <div className="text-slate-300 text-right min-w-0 truncate">{content}</div>
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
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
                  <Spinner />
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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm text-slate-400">
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
