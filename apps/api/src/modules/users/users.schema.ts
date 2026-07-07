import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  targetExam: z.enum(['upsc', 'kerala_psc', 'other_psc']).optional(),
});

export const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['student', 'instructor', 'admin']).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  batchId: z.string().uuid().optional(),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['student', 'instructor', 'admin']),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
