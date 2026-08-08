import { z } from 'zod';

const installmentSchema = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().positive(),
  dueAfterDays: z.number().int().min(0).max(1095),
});

export const createFeePlanSchema = z
  .object({
    name: z.string().min(2).max(120),
    totalAmount: z.number().positive(),
    installments: z.array(installmentSchema).min(1).max(12),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).default(0),
  })
  // Installments must add up to the plan total — otherwise the materialised
  // schedule would never reconcile against admissions.feeAmount.
  .refine(
    (v) => Math.abs(v.installments.reduce((s, i) => s + i.amount, 0) - v.totalAmount) < 0.01,
    { message: 'Installment amounts must sum to the plan total', path: ['installments'] },
  );

export const updateFeePlanSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    totalAmount: z.number().positive().optional(),
    installments: z.array(installmentSchema).min(1).max(12).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (v) =>
      v.installments === undefined ||
      v.totalAmount === undefined ||
      Math.abs(v.installments.reduce((s, i) => s + i.amount, 0) - v.totalAmount) < 0.01,
    { message: 'Installment amounts must sum to the plan total', path: ['installments'] },
  );

export const setCourseFeeSchema = z.object({
  feeAmount: z.number().min(0),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['upi', 'cash', 'card', 'bank_transfer', 'other']).default('upi'),
  installmentId: z.string().uuid().optional(),
  reference: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

export const createPaymentAccountSchema = z.object({
  name: z.string().min(2).max(120),
  vpa: z.string().min(3).max(120),
  payeeName: z.string().min(2).max(120),
  branchId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export const updatePaymentAccountSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  vpa: z.string().min(3).max(120).optional(),
  payeeName: z.string().min(2).max(120).optional(),
  branchId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const feesOverviewQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  counsellorId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateFeePlanInput = z.infer<typeof createFeePlanSchema>;
export type UpdateFeePlanInput = z.infer<typeof updateFeePlanSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type FeesOverviewQuery = z.infer<typeof feesOverviewQuerySchema>;
export type CreatePaymentAccountInput = z.infer<typeof createPaymentAccountSchema>;
export type UpdatePaymentAccountInput = z.infer<typeof updatePaymentAccountSchema>;
