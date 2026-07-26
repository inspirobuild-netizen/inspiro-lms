import { z } from 'zod';

const phoneRe = /^\+91[6-9]\d{9}$/;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createStaffSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email().max(255).transform((v) => v.trim().toLowerCase()),
  phone: z.string().regex(phoneRe, 'Enter a valid +91 mobile number'),
  password: z.string().min(8).max(128),
  staffRoleId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dob: dateStr.optional(),
  whatsapp: z.string().max(15).optional(),
  address: z.string().max(1000).optional(),
  joiningDate: dateStr.optional(),
  department: z.string().max(100).optional(),
  designation: z.string().max(100).optional(),
  photoUrl: z.string().url().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateStaffSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  staffRoleId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dob: dateStr.nullable().optional(),
  whatsapp: z.string().max(15).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  joiningDate: dateStr.nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  designation: z.string().max(100).nullable().optional(),
  photoUrl: z.string().url().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const staffStatusSchema = z.object({ isActive: z.boolean() });
export const staffResetPasswordSchema = z.object({ password: z.string().min(8).max(128) });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
