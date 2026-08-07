'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Modal, Select, Field } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { money } from '@/lib/utils';

type UpiRequest = { upiUri: string; amount: number; reference: string; payeeName: string; vpa: string };

/**
 * Collect a payment against an admission. UPI shows a scannable QR with the
 * amount preset — the counsellor confirms receipt manually since there is no
 * webhook to auto-detect a plain UPI collect request landing.
 */
export function PaymentModal({
  open, admissionId, defaultAmount, installmentId, onClose, onRecorded,
}: {
  open: boolean;
  admissionId: string | null;
  defaultAmount: number;
  installmentId?: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const qc = useQueryClient();
  const toast = useToast();

  const [method, setMethod] = useState<'upi' | 'cash' | 'card' | 'bank_transfer' | 'other'>('upi');
  const [amount, setAmount] = useState(String(defaultAmount));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) { setMethod('upi'); setAmount(String(defaultAmount)); setReference(''); setNote(''); }
  }, [open, defaultAmount]);

  const amountNum = Number(amount) || 0;
  const upiQuery = useQuery({
    queryKey: ['admin', 'admission', admissionId, 'upi-qr', amountNum],
    queryFn: () => api.get<UpiRequest>(`/api/v1/admin/admissions/${admissionId}/upi-qr?amount=${amountNum}`),
    enabled: open && method === 'upi' && !!admissionId && amountNum > 0,
    staleTime: 60_000,
  });

  const record = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/admin/admissions/${admissionId}/payments`, {
        amount: amountNum,
        method,
        installmentId,
        reference: reference.trim() || (method === 'upi' ? upiQuery.data?.data.reference : undefined) || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast('Payment recorded', 'success');
      void qc.invalidateQueries({ queryKey: ['admin', 'admission', admissionId] });
      onRecorded();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed to record payment', 'error'),
  });

  if (!admissionId) return null;

  return (
    <Modal open={open} onClose={onClose} title="Collect payment" description="The QR does not auto-confirm — confirm once you see it land in your UPI app" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Amount">
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="upi">UPI (QR)</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>

        {method === 'upi' && (
          <div className="rounded-2xl border border-white/8 bg-surface-2 p-5 flex flex-col items-center gap-3">
            {amountNum <= 0 ? (
              <p className="text-sm text-slate-500">Enter an amount to generate the QR</p>
            ) : upiQuery.isLoading ? (
              <p className="text-sm text-slate-500">Generating QR…</p>
            ) : upiQuery.isError ? (
              <p className="text-sm text-rose-400 text-center">
                {upiQuery.error instanceof ApiError ? upiQuery.error.message : 'Could not generate a UPI QR — check the branch/UPI_VPA config.'}
              </p>
            ) : upiQuery.data ? (
              <>
                <div className="bg-white p-3 rounded-xl">
                  <QRCodeSVG value={upiQuery.data.data.upiUri} size={200} level="M" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-200 font-medium">{money(upiQuery.data.data.amount)} to {upiQuery.data.data.payeeName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{upiQuery.data.data.vpa} · Ref {upiQuery.data.data.reference}</p>
                </div>
                <p className="text-xs text-amber-400 text-center max-w-sm">
                  Scan with any UPI app (GPay, PhonePe, etc.). This does not auto-confirm — tap &quot;Payment received&quot; below only after the money actually lands in your account.
                </p>
              </>
            ) : null}
          </div>
        )}

        <Field label="Reference (optional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'upi' ? 'Auto-filled from the QR reference if left blank' : 'Receipt / transaction no.'} />
        </Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={record.isPending} disabled={amountNum <= 0} onClick={() => record.mutate()}>
            {method === 'upi' ? 'Payment received' : 'Record payment'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
