import { z } from 'zod';

export const createLiveClassSchema = z.object({
  batchId: z.string().uuid(),
  subject: z.string().min(1).max(100),
  title: z.string().min(3).max(255),
  instructorId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
});

export const updateLiveClassSchema = createLiveClassSchema.partial();

export const listLiveClassesSchema = z.object({
  batchId: z.string().uuid().optional(),
  isCompleted: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateLiveClassInput = z.infer<typeof createLiveClassSchema>;
export type UpdateLiveClassInput = z.infer<typeof updateLiveClassSchema>;
export type ListLiveClassesInput = z.infer<typeof listLiveClassesSchema>;
