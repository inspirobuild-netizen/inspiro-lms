import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { logAudit } from '../../lib/audit.js';
import { parseYouTubeId, verifyYouTubeVideo } from '../../lib/youtube.js';
import { lessonIdsForScope, planMediaCleanup } from './media-cleanup.service.js';
import { resolveDoc } from '../../lib/local-storage.js';
import { requireRoleOrPermission } from '../../middleware/require-permission.js';
import {
  createCourseSchema,
  updateCourseSchema,
  createModuleSchema,
  updateModuleSchema,
  reorderModulesSchema,
  createLessonSchema,
  updateLessonSchema,
  updateProgressSchema,
  listCoursesSchema,
} from './courses.schema.js';
import {
  listCourses,
  listCourseBatches,
  getMyCourseProgress,
  getCourseDetail,
  getModuleLessons,
  getLessonWatchUrl,
  getLessonFileName,
  updateProgress,
  createCourse,
  updateCourse,
  deleteCourse,
  createModule,
  updateModule,
  reorderModules,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
} from './courses.service.js';
import { getBatchContent, createBatchModule, copyContentToBatch } from './batch-content.service.js';

type ZodSchema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } };

function validate<T>(schema: ZodSchema<T>, value: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    void reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() } });
    return null;
  }
  return r.data;
}

/**
 * Turns whatever the staff member pasted into a stored video id, and refuses
 * anything that would not actually play. Returns null when the caller sent no
 * youtubeUrl at all, so PATCH can leave the field untouched.
 */
async function resolveYouTube(
  raw: string | undefined,
  reply: FastifyReply,
): Promise<{ id: string } | 'invalid' | null> {
  if (raw === undefined) return null;
  const id = parseYouTubeId(raw);
  if (!id) {
    void reply.status(400).send({
      success: false,
      error: {
        code: 'BAD_YOUTUBE_URL',
        message: 'That does not look like a YouTube link. Paste the full video URL from the address bar.',
      },
    });
    return 'invalid';
  }
  const check = await verifyYouTubeVideo(id);
  if (!check.ok) {
    void reply.status(400).send({
      success: false,
      error: { code: 'YOUTUBE_NOT_PLAYABLE', message: check.reason ?? 'That video cannot be embedded.' },
    });
    return 'invalid';
  }
  return { id };
}

export default async function coursesRoutes(app: FastifyInstance) {
  // ── List courses ───────────────────────────────────────────────────────────
  app.get('/courses', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(listCoursesSchema, req.query, reply);
    if (!input) return;
    const { items, total } = await listCourses(input, req.user.sub, req.user.role);
    return reply.send({ success: true, data: items, meta: { page: input.page, limit: input.limit, total } });
  });

  // ── Course detail with modules ─────────────────────────────────────────────
  app.get('/courses/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const course = await getCourseDetail(id, req.user.sub, req.user.role);
    return reply.send({ success: true, data: course });
  });

  // ── My progress across enrolled courses ────────────────────────────────────
  app.get('/me/course-progress', { preHandler: [authenticate] }, async (req, reply) => {
    return reply.send({ success: true, data: await getMyCourseProgress(req.user.sub) });
  });

  // ── Batches under a course — admin batch-picker + mobile catalog ───────────
  app.get('/courses/:id/batches', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await listCourseBatches(id) });
  });

  // ── Module lessons (with drip check) ──────────────────────────────────────
  app.get('/modules/:id/lessons', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const lessonList = await getModuleLessons(id, req.user.sub, req.user.role);
    return reply.send({ success: true, data: lessonList });
  });

  // ── Signed watch URL ───────────────────────────────────────────────────────
  // ── Stream a notes PDF ─────────────────────────────────────────────────────
  // Authenticated and enrolment-checked on every request, so the URL is safe
  // to hand to the app but useless to anyone else.
  app.get('/lessons/:id/file', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const filename = await getLessonFileName(id, req.user.sub, req.user.role);
    const found = await resolveDoc(filename);
    if (!found) {
      return reply.status(404).send({
        success: false,
        error: { code: 'FILE_MISSING', message: 'These notes are no longer available' },
      });
    }
    // inline so the app's viewer renders it rather than the OS offering a
    // download — the whole point is that notes stay inside the app.
    return reply
      .header('Content-Type', found.contentType)
      .header('Content-Length', found.size)
      .header('Content-Disposition', 'inline')
      .send(found.stream);
  });

  app.get('/lessons/:id/watch-url', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await getLessonWatchUrl(id, req.user.sub, req.user.role);
    return reply.send({ success: true, data: result });
  });

  // ── Update lesson progress ─────────────────────────────────────────────────
  app.post('/lessons/:id/progress', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = validate(updateProgressSchema, req.body, reply);
    if (!input) return;
    const progress = await updateProgress(id, req.user.sub, input);
    return reply.send({ success: true, data: progress });
  });



  // ── What deleting this would remove from storage ───────────────────────────
  // Read-only. The admin panel calls it to write a confirmation with real
  // numbers — "3 videos deleted, 2 kept because another batch uses them" —
  // rather than a warning nobody can act on.
  app.get(
    '/admin/content/deletion-preview',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const q = req.query as { scope?: string; id?: string };
      const kind = q.scope;
      if (!q.id || (kind !== 'lesson' && kind !== 'module' && kind !== 'batch' && kind !== 'course')) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_SCOPE', message: 'scope must be lesson, module, batch or course, with an id' },
        });
      }
      const lessonIds = await lessonIdsForScope({ kind, id: q.id });
      const plan = await planMediaCleanup(lessonIds);
      return reply.send({
        success: true,
        data: {
          lessons: plan.lessonCount,
          videosToDelete: plan.orphanVideos.length,
          videosKeptInUse: plan.sharedVideos,
          notesToDelete: plan.orphanDocs.length,
          notesKeptInUse: plan.sharedDocs,
          linkedVideosUntouched: plan.youtubeCount,
        },
      });
    },
  );

  // ══ Per-batch content management ═══════════════════════════════════════════
  // Content lives on batches; a course's batchId-null modules are its master
  // template. Lesson-level routes below work unchanged for batch modules,
  // since lessons hang off modules either way.

  app.get(
    '/admin/batches/:id/content',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const data = await getBatchContent(id);
      return reply.send({ success: true, data });
    },
  );

  app.post(
    '/admin/batches/:id/modules',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(createModuleSchema, req.body, reply);
      if (!input) return;
      const mod = await createBatchModule(id, input);
      return reply.status(201).send({ success: true, data: mod });
    },
  );

  app.post(
    '/admin/batches/:id/content/copy',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { fromBatchId?: string; fromCourseId?: string };
      const result = await copyContentToBatch(id, body, req.user.sub);
      await logAudit(req, {
        action: 'batch.content_copied',
        entityType: 'batch',
        entityId: id,
        meta: { ...body, ...result },
      });
      return reply.status(201).send({ success: true, data: result });
    },
  );

  // ══ Admin routes ═══════════════════════════════════════════════════════════

  // ── Create course ──────────────────────────────────────────────────────────
  app.post(
    '/admin/courses',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const input = validate(createCourseSchema, req.body, reply);
      if (!input) return;
      const course = await createCourse(input, req.user.sub);
      return reply.status(201).send({ success: true, data: course });
    },
  );

  // ── Update course ──────────────────────────────────────────────────────────
  app.patch(
    '/admin/courses/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(updateCourseSchema, req.body, reply);
      if (!input) return;
      const course = await updateCourse(id, input);
      return reply.send({ success: true, data: course });
    },
  );

  // ── Delete course (only when nothing depends on it) ────────────────────────
  app.delete(
    '/admin/courses/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteCourse(id);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Create module ──────────────────────────────────────────────────────────
  app.post(
    '/admin/courses/:id/modules',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(createModuleSchema, req.body, reply);
      if (!input) return;
      const mod = await createModule(id, input);
      return reply.status(201).send({ success: true, data: mod });
    },
  );

  // ── Update module ──────────────────────────────────────────────────────────
  app.patch(
    '/admin/modules/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(updateModuleSchema, req.body, reply);
      if (!input) return;
      const mod = await updateModule(id, input);
      return reply.send({ success: true, data: mod });
    },
  );

  // ── Reorder modules ────────────────────────────────────────────────────────
  app.post(
    '/admin/courses/:id/modules/reorder',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const input = validate(reorderModulesSchema, req.body, reply);
      if (!input) return;
      const result = await reorderModules(input.items);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Delete module ──────────────────────────────────────────────────────────
  app.delete(
    '/admin/modules/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteModule(id);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Create lesson ──────────────────────────────────────────────────────────
  app.post(
    '/admin/modules/:id/lessons',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(createLessonSchema, req.body, reply);
      if (!input) return;
      const yt = await resolveYouTube(input.youtubeUrl, reply);
      if (yt === 'invalid') return;
      const lesson = await createLesson(id, {
        ...input,
        ...(yt ? { youtubeVideoId: yt.id, videoProvider: 'youtube' as const } : {}),
      });
      return reply.status(201).send({ success: true, data: lesson });
    },
  );

  // ── Update lesson ──────────────────────────────────────────────────────────
  app.patch(
    '/admin/lessons/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(updateLessonSchema, req.body, reply);
      if (!input) return;
      const yt = await resolveYouTube(input.youtubeUrl, reply);
      if (yt === 'invalid') return;
      const lesson = await updateLesson(id, {
        ...input,
        ...(yt ? { youtubeVideoId: yt.id, videoProvider: 'youtube' as const } : {}),
      });
      return reply.send({ success: true, data: lesson });
    },
  );

  // ── Reorder lessons ────────────────────────────────────────────────────────
  app.post(
    '/admin/modules/:id/lessons/reorder',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const input = validate(
        z.object({ items: z.array(z.object({ id: z.string().uuid(), order: z.number().int().nonnegative() })).min(1) }),
        req.body,
        reply,
      );
      if (!input) return;
      const result = await reorderLessons(input.items);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Delete lesson ──────────────────────────────────────────────────────────
  app.delete(
    '/admin/lessons/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteLesson(id);
      return reply.send({ success: true, data: result });
    },
  );
}
