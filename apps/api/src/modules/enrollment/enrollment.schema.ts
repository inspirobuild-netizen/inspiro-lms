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

export const confirmEnrollRequestSchema = z.object({
  reference: z.string().min(3).max(120),
});

export const verifyEnrollRequestSchema = z.object({
  batchId: z.string().uuid(),
});

export const rejectEnrollRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CreateEnrollRequestInput = z.infer<typeof createEnrollRequestSchema>;
export type ConfirmEnrollRequestInput = z.infer<typeof confirmEnrollRequestSchema>;
export type VerifyEnrollRequestInput = z.infer<typeof verifyEnrollRequestSchema>;
export type RejectEnrollRequestInput = z.infer<typeof rejectEnrollRequestSchema>;
