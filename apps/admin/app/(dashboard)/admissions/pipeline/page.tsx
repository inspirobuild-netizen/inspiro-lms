'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { formatPhone } from '@/lib/utils';

type Card = { id: string; leadCode: string; studentName: string; phone: string; courseInterested: string | null; priority: string; status: string; ownerName: string | null };

const STAGES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'interested', label: 'Interested' },
  { key: 'demo', label: 'Demo' },
  { key: 'counselling', label: 'Counselling' },
  { key: 'fee_discussion', label: 'Fee Discussion' },
  { key: 'admission_confirmed', label: 'Admission Confirmed' },
] as const;

const priorityVariant: Record<string, 'rose' | 'amber' | 'slate'> = { hot: 'rose', warm: 'amber', cold: 'slate' };

export default function PipelinePage() {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'pipeline'],
    queryFn: () => api.get<Card[]>('/api/v1/leads/pipeline'),
    enabled: !!accessToken,
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/api/v1/leads/${id}/status`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['crm', 'pipeline'] }),
    onError: (e) => { toast(e instanceof ApiError ? e.message : 'Failed to move lead', 'error'); void qc.invalidateQueries({ queryKey: ['crm', 'pipeline'] }); },
  });

  const cards = data?.data ?? [];
  const byStage = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const s of STAGES) m.set(s.key, []);
    for (const c of cards) m.get(c.status)?.push(c);
    return m;
  }, [cards]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const active = cards.find((c) => c.id === activeId);

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over) return;
    const card = cards.find((c) => c.id === a.id);
    const newStatus = String(over.id);
    if (!card || card.status === newStatus) return;
    // Optimistic local update
    qc.setQueryData(['crm', 'pipeline'], (old: { data: Card[]; meta?: unknown } | undefined) =>
      old ? { ...old, data: old.data.map((c) => (c.id === card.id ? { ...c, status: newStatus } : c)) } : old,
    );
    move.mutate({ id: card.id, status: newStatus });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Admission Pipeline</h2>
        <p className="text-slate-400 text-sm mt-1">Drag a lead card between stages to update its status</p>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((s) => (
              <Column key={s.key} id={s.key} label={s.label} cards={byStage.get(s.key) ?? []} />
            ))}
          </div>
          <DragOverlay>{active && <LeadCard card={active} dragging />}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({ id, label, cards }: { id: string; label: string; cards: Card[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 flex-shrink-0 rounded-2xl border p-3 transition-colors ${isOver ? 'border-brand-violet bg-brand-violet/5' : 'border-white/8 bg-surface-1'}`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold text-slate-200">{label}</h3>
        <span className="text-xs text-slate-500">{cards.length}</span>
      </div>
      <div className="space-y-2 min-h-[80px]">
        {cards.map((c) => <DraggableCard key={c.id} card={c} />)}
      </div>
    </div>
  );
}

function DraggableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <LeadCard card={card} />
    </div>
  );
}

function LeadCard({ card, dragging }: { card: Card; dragging?: boolean }) {
  return (
    <Link
      href={`/admissions/leads/${card.id}`}
      onClick={(e) => dragging && e.preventDefault()}
      className={`block rounded-xl bg-surface-2 border border-white/8 p-3 hover:bg-surface-high transition-colors cursor-grab active:cursor-grabbing ${dragging ? 'shadow-2xl rotate-2' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-200 truncate">{card.studentName}</p>
        <Badge variant={priorityVariant[card.priority]}>{card.priority}</Badge>
      </div>
      <p className="text-xs text-slate-500 mt-1">{card.leadCode} · {formatPhone(card.phone)}</p>
      {card.courseInterested && <p className="text-xs text-slate-400 mt-1 truncate">{card.courseInterested}</p>}
      {card.ownerName && <p className="text-xs text-slate-500 mt-1">{card.ownerName}</p>}
    </Link>
  );
}
