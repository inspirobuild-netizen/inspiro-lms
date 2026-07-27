import { z } from 'zod';

export const rejectSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export const requestChangesSchema = z.object({
  note: z.string().min(3).max(1000),
});

export const mergeDuplicateSchema = z.object({
  primaryId: z.string().uuid(),
  duplicateId: z.string().uuid(),
});

export type RejectInput = z.infer<typeof rejectSchema>;
export type RequestChangesInput = z.infer<typeof requestChangesSchema>;
export type MergeDuplicateInput = z.infer<typeof mergeDuplicateSchema>;
