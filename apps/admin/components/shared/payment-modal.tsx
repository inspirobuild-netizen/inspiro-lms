'use client';

import { useEffect, useMemo, useState } from 'react';
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
type PaymentAccount = { id: string; name: string; vpa: string; payeeName: string; branchId: string | null; isActive: boolean; isDefault: boolean };
type InstallmentRow = { id: string; label: string; amount: number; paidAmount: number; status: 'pending' | 'paid' | 'waived' };
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const [selectedInstallmentId, setSelectedInstallmentId] = useState(installmentId ?? '');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');

  useEffect(() => {
    if (open) {
      setMethod('upi'); setAmount(String(defaultAmount)); setReference(''); setNote(''); setAccountId('');
      setSelectedInstallmentId(installmentId ?? '');
    }
  }, [open, defaultAmount, installmentId]);

  const accountsQuery = useQuery({
    queryKey: ['admin', 'payment-accounts'],
    queryFn: () => api.get<PaymentAccount[]>('/api/v1/payment-accounts'),
    enabled: open && method === 'upi',
    staleTime: 60_000,
  });
  const activeAccounts = (accountsQuery.data?.data ?? []).filter((a) => a.isActive);

  // The installment target is preset from a specific outstanding row, or —
  // for UPI at conversion time — a preset list the counsellor picks from,
  // never a number they type freely (so the QR amount can't be tampered with).
  const installmentsQuery = useQuery({
    queryKey: ['admin', 'admission', admissionId, 'installments'],
    queryFn: () => api.get<InstallmentRow[]>(`/api/v1/admin/admissions/${admissionId}/installments`),
    enabled: open && method === 'upi' && !!admissionId && !installmentId,
    staleTime: 30_000,
  });
  const pendingInstallments = useMemo(
    () => (installmentsQuery.data?.data ?? []).filter((i) => i.status === 'pending'),
    [installmentsQuery.data],
  );

  useEffect(() => {
    if (open && method === 'upi' && !installmentId && !selectedInstallmentId && pendingInstallments.length > 0) {
      setSelectedInstallmentId(pendingInstallments[0]!.id);
    }
  }, [open, method, installmentId, selectedInstallmentId, pendingInstallments]);

  const selectedInstallment = pendingInstallments.find((i) => i.id === selectedInstallmentId);
  const upiLockedAmount = installmentId
    ? defaultAmount
    : selectedInstallment
      ? round2(selectedInstallment.amount - selectedInstallment.paidAmount)
      : defaultAmount; // no plan/installments on this admission — fall back to the preset amount, still locked
  const showInstallmentPicker = method === 'upi' && !installmentId && pendingInstallments.length > 0;

  const amountNum = method === 'upi' ? upiLockedAmount : (Number(amount) || 0);
  const effectiveInstallmentId = installmentId ?? (showInstallmentPicker ? selectedInstallmentId : undefined);

  const upiQuery = useQuery({
    queryKey: ['admin', 'admission', admissionId, 'upi-qr', amountNum, accountId],
    queryFn: () => api.get<UpiRequest>(`/api/v1/admin/admissions/${admissionId}/upi-qr?amount=${amountNum}${accountId ? `&accountId=${accountId}` : ''}`),
    enabled: open && method === 'upi' && !!admissionId && amountNum > 0,
    staleTime: 60_000,
  });

  const record = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/admin/admissions/${admissionId}/payments`, {
        amount: amountNum,
        method,
        installmentId: effectiveInstallmentId,
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
          <Field label={showInstallmentPicker ? 'Installment' : 'Amount'}>
            {method === 'upi' ? (
              showInstallmentPicker ? (
                <Select value={selectedInstallmentId} onChange={(e) => setSelectedInstallmentId(e.target.value)}>
                  {pendingInstallments.map((i) => (
                    <option key={i.id} value={i.id}>{i.label} — {money(round2(i.amount - i.paidAmount))} due</option>
                  ))}
                </Select>
              ) : (
                <div className="flex h-10 items-center rounded-xl border border-white/10 bg-surface-2 px-3 text-sm text-slate-200">
                  {money(upiLockedAmount)}
                </div>
              )
            ) : (
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
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

        {method === 'upi' && activeAccounts.length > 1 && (
          <Field label="Collect into">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Default account</option>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.vpa})</option>)}
            </Select>
          </Field>
        )}

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
