import { z } from 'zod';

export const createCourseSchema = z.object({
  title: z.string().min(2).max(255),
  subject: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  thumbnailUrl: z.string().url().optional(),
});

export const updateCourseSchema = createCourseSchema.partial().extend({
  isPublished: z.boolean().optional(),
  // null = remove the thumbnail
  thumbnailUrl: z.string().url().nullable().optional(),
});

export const createModuleSchema = z.object({
  title: z.string().min(2).max(255),
  order: z.number().int().nonnegative().default(0),
  unlockDate: z.string().datetime().optional(),
});

export const updateModuleSchema = createModuleSchema.partial();

export const reorderModulesSchema = z.object({
  // Array of { id, order } to set new positions
  items: z.array(z.object({ id: z.string().uuid(), order: z.number().int().nonnegative() })).min(1),
});

export const createLessonSchema = z.object({
  title: z.string().min(2).max(255),
  type: z.enum(['video', 'pdf', 'audio', 'live_recording']),
  order: z.number().int().nonnegative().default(0),
  duration: z.number().int().positive().optional(),
  isDownloadable: z.boolean().default(false),
  bunnyVideoId: z.string().optional(),
  bunnyLibraryId: z.string().optional(),
  // Either a bare stored filename ("<uuid>.pdf") for notes uploaded through
  // the admin panel, or a full URL for legacy rows that still point at Bunny.
  // A plain .url() would reject every new upload.
  fileUrl: z
    .string()
    .min(1)
    .max(2048)
    .refine((v) => /^[0-9a-f-]{36}\.pdf$/.test(v) || /^https?:\/\//.test(v), {
      message: 'Must be an uploaded file reference or an http(s) URL',
    })
    .optional(),
});

export const updateLessonSchema = createLessonSchema.partial();

export const updateProgressSchema = z.object({
  watchedSeconds: z.number().int().nonnegative(),
  isCompleted: z.boolean().optional(),
});

export const listCoursesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  subject: z.string().optional(),
  isPublished: z.coerce.boolean().optional(),
  batchId: z.string().uuid().optional(),
  // 'catalog' = the public marketing browse (all published courses, no
  // enrollment check) used by students who haven't enrolled in anything yet.
  scope: z.enum(['catalog']).optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;
export type ListCoursesInput = z.infer<typeof listCoursesSchema>;
