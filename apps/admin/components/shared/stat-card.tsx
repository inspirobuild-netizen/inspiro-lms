import { cn } from '@/lib/utils';

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'violet' | 'teal' | 'amber' | 'rose';
  icon?: React.ReactNode;
};

const accentClass = {
  violet: 'text-violet-400 bg-brand-violet/15',
  teal: 'text-teal-400 bg-brand-teal/15',
  amber: 'text-amber-400 bg-brand-amber/15',
  rose: 'text-rose-400 bg-brand-rose/15',
};

export function StatCard({ label, value, sub, accent = 'violet', icon }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5 flex items-start gap-4">
      {icon && (
        <div className={cn('rounded-xl p-2.5 flex-shrink-0', accentClass[accent])}>
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm text-slate-400">{label}</p>
        <p className="font-display font-bold text-2xl text-slate-100 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}
