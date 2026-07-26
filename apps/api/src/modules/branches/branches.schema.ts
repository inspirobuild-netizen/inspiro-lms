import { z } from 'zod';

export const createBranchSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Code: letters, numbers, - or _ only'),
  address: z.string().max(1000).optional(),
  phone: z.string().max(20).optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().max(1000).optional(),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
