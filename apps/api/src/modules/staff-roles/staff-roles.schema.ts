import { z } from 'zod';

export const createStaffRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
});

export const updateStaffRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional(),
});

export const setRolePermissionsSchema = z.object({
  permissions: z.array(z.string().max(100)),
});

export type CreateStaffRoleInput = z.infer<typeof createStaffRoleSchema>;
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleSchema>;
