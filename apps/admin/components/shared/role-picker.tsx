'use client';

export type RoleOption = { id: string; name: string };

/**
 * Tick every role a staff member holds. One person can hold several — an
 * Admission Counsellor who is also a Mentor — and gets the permissions of all
 * of them. The first one ticked is their main role, shown first in lists.
 */
export function RolePicker({
  roles, selected, onChange,
}: { roles: RoleOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  if (roles.length === 0) return <p className="text-sm text-slate-500">No roles yet — create one under Roles.</p>;
  return (
    <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
      {roles.map((r) => {
        const on = selected.includes(r.id);
        return (
          <label key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-white/5">
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(on ? selected.filter((x) => x !== r.id) : [...selected, r.id])}
            />
            <span className={on ? 'text-slate-100' : 'text-slate-400'}>{r.name}</span>
            {on && selected[0] === r.id && selected.length > 1 && (
              <span className="ml-auto text-[11px] text-slate-500">main role</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
