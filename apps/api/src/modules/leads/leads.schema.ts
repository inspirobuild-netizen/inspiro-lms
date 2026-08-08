import { z } from 'zod';

const source = z.enum(['facebook', 'instagram', 'google', 'website', 'walk_in', 'referral', 'seminar', 'campaign', 'mobile_app', 'other']);
const priority = z.enum(['hot', 'warm', 'cold']);
const status = z.enum(['new', 'contacted', 'interested', 'demo', 'counselling', 'fee_discussion', 'admission_confirmed', 'converted', 'not_interested', 'lost']);

export const createLeadSchema = z.object({
  studentName: z.string().min(2).max(255),
  parentName: z.string().max(255).optional(),
  phone: z.string().min(6).max(20),
  whatsapp: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  courseInterested: z.string().max(255).optional(),
  source: source.default('other'),
  priority: priority.default('warm'),
  ownerId: z.string().uuid().optional(), // admins may assign; counsellors default to self
  branchId: z.string().uuid().optional(),
  remarks: z.string().max(2000).optional(),
  nextFollowupAt: z.string().datetime().optional(),
});

export const updateLeadSchema = z.object({
  studentName: z.string().min(2).max(255).optional(),
  parentName: z.string().max(255).nullable().optional(),
  phone: z.string().min(6).max(20).optional(),
  whatsapp: z.string().max(20).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(120).nullable().optional(),
  courseInterested: z.string().max(255).nullable().optional(),
  source: source.optional(),
  priority: priority.optional(),
  ownerId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  remarks: z.string().max(2000).nullable().optional(),
  nextFollowupAt: z.string().datetime().nullable().optional(),
});

export const addFollowupSchema = z.object({
  remarks: z.string().min(1).max(2000),
  callSummary: z.string().max(2000).optional(),
  nextAction: z.string().max(255).optional(),
  reminderAt: z.string().datetime().optional(),
  nextFollowupAt: z.string().datetime().optional(), // also updates the lead
});

export const changeStatusSchema = z.object({
  status,
});

export const convertLeadSchema = z.object({
  // Course is the master — a batch belongs to exactly one course, so course
  // is derived server-side from the batch, never a second independent input.
  batchId: z.string().uuid(),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // The fee is always resolved server-side from a preset — this plan (its
  // installments materialise onto the admission), else the chosen course's
  // own preset feeAmount, else free. There is deliberately no feeAmount/
  // feePlan input here: a counsellor-typed figure was the exact loophole
  // that let the "no free-typed collection amount" rule be bypassed.
  feePlanId: z.string().uuid().optional(),
  targetExam: z.enum(['upsc', 'kerala_psc', 'other_psc']).optional(),
  // Optional: gives the student immediate email+password app access (bypasses
  // OTP, useful while MSG91 DLT template approval is pending).
  password: z.string().min(8).max(128).optional(),
  // Optional: collect the first installment right at the admission desk.
  collectAmount: z.number().positive().optional(),
  collectMethod: z.enum(['upi', 'cash', 'card', 'bank_transfer', 'other']).default('upi'),
  collectReference: z.string().max(120).optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
