import { z } from 'zod';

export const createBatchSchema = z.object({
  name: z.string().min(2).max(255),
  // Course is the master — every batch belongs to exactly one course.
  courseId: z.string().uuid(),
  type: z.enum(['online', 'offline', 'hybrid']),
  targetExam: z.enum(['upsc', 'kerala_psc', 'other_psc']),
  startDate: z.string().date(),
  endDate: z.string().date(),
  capacity: z.number().int().positive().max(10_000).default(100),
  description: z.string().max(2000).optional(),
});

export const updateBatchSchema = createBatchSchema.partial().extend({
  status: z.enum(['upcoming', 'active', 'completed', 'archived']).optional(),
});

// feePlanId is optional; when omitted the admission's fee falls back to the
// course fee. The amount itself is never accepted from the client — it is
// resolved server-side from the plan or the course.
export const enrollStudentSchema = z.object({
  userId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
  feePlanId: z.string().uuid().optional(),
});

export const bulkEnrollSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  expiresAt: z.string().datetime().optional(),
  feePlanId: z.string().uuid().optional(),
});

export const assignInstructorSchema = z.object({
  instructorId: z.string().uuid(),
});

export const listBatchesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['upcoming', 'active', 'completed', 'archived']).optional(),
  type: z.enum(['online', 'offline', 'hybrid']).optional(),
  targetExam: z.enum(['upsc', 'kerala_psc', 'other_psc']).optional(),
  courseId: z.string().uuid().optional(),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type ListBatchesInput = z.infer<typeof listBatchesSchema>;
