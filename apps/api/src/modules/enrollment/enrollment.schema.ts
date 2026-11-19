import { z } from 'zod';

export const createEnrollRequestSchema = z.object({
  courseId: z.string().uuid(),
  // Preset plan (preferred) — installmentIndex picks which of its
  // installments to collect first, never a typed amount.
  feePlanId: z.string().uuid().optional(),
  installmentIndex: z.number().int().min(0).default(0),
  // Optional: pick a specific preset payment account's QR, same as the admin flow.
  accountId: z.string().uuid().optional(),
});

export const checkoutSchema = z.object({
  courseId: z.string().uuid(),
  // Preset plan (optional) — installmentIndex picks which installment to
  // collect first, never a typed amount.
  feePlanId: z.string().uuid().optional(),
  installmentIndex: z.number().int().min(0).default(0),
});

export const confirmEnrollRequestSchema = z.object({
  reference: z.string().min(3).max(120),
});

export const verifyEnrollRequestSchema = z.object({
  batchId: z.string().uuid(),
  // Approving an app request for a PAID course collects the first payment in
  // the same step (the academy's rule from 19 Nov 2026, same as converting a
  // lead): the full fee, or the first instalment of the chosen plan. The fee
  // itself is never typed — it comes from the course or the plan.
  feePlanId: z.string().uuid().optional(),
  collectAmount: z.number().positive().optional(),
  collectMethod: z.enum(['upi', 'cash', 'card', 'bank_transfer', 'other']).default('cash'),
  collectReference: z.string().max(120).optional(),
});

export const rejectEnrollRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CreateEnrollRequestInput = z.infer<typeof createEnrollRequestSchema>;
export type ConfirmEnrollRequestInput = z.infer<typeof confirmEnrollRequestSchema>;
export type VerifyEnrollRequestInput = z.infer<typeof verifyEnrollRequestSchema>;
export type RejectEnrollRequestInput = z.infer<typeof rejectEnrollRequestSchema>;
