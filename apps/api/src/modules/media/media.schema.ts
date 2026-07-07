import { z } from 'zod';

export const createVideoSchema = z.object({
  lessonId: z.string().uuid(),
  title: z.string().min(1).max(255),
  // optional: which Bunny library to use (defaults to env var)
  libraryId: z.string().optional(),
});

// Bunny Stream webhook payload shape (status codes from Bunny docs)
export const bunnyWebhookSchema = z.object({
  VideoLibraryId: z.number(),
  VideoGuid: z.string(),
  Status: z.number(),
  // Status meanings:
  // 0 = Queued  1 = Processing  2 = Encoding
  // 3 = Finished (all resolutions)
  // 4 = Resolution finished (partial)
  // 5 = Failed
  // 6 = PresignedUploadStarted  7 = PresignedUploadFinished  8 = PresignedUploadFailed
  Title: z.string().optional(),
  StorageSize: z.number().optional(),
  Encodes: z.array(z.object({ name: z.string(), width: z.number(), height: z.number() })).optional(),
});

export const createPresignedUploadSchema = z.object({
  lessonId: z.string().uuid(),
  title: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024 * 1024), // max 10 GB
  mimeType: z.enum(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type BunnyWebhookPayload = z.infer<typeof bunnyWebhookSchema>;
export type CreatePresignedUploadInput = z.infer<typeof createPresignedUploadSchema>;
