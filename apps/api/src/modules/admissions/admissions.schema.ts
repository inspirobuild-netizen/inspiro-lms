import { z } from 'zod';

export const updatePaymentSchema = z.object({
  feeAmount: z.number().nonnegative().optional(),
  amountPaid: z.number().nonnegative().optional(),
  feePlan: z.string().max(120).nullable().optional(),
  paymentStatus: z.enum(['pending', 'partial', 'paid']).optional(),
});

export const setTargetSchema = z.object({
  counsellorId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'),
  targetAdmissions: z.number().int().nonnegative().default(0),
  targetRevenue: z.number().nonnegative().default(0),
});

export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type SetTargetInput = z.infer<typeof setTargetSchema>;
