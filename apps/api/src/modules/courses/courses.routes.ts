import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
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
  updateProgress,
  createCourse,
  updateCourse,
  createModule,
  updateModule,
  reorderModules,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
} from './courses.service.js';

type ZodSchema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } };

function validate<T>(schema: ZodSchema<T>, value: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    void reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() } });
    return null;
  }
  return r.data;
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

  // ══ Admin routes ═══════════════════════════════════════════════════════════

  // ── Create course ──────────────────────────────────────────────────────────
  app.post(
    '/admin/courses',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
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
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(updateCourseSchema, req.body, reply);
      if (!input) return;
      const course = await updateCourse(id, input);
      return reply.send({ success: true, data: course });
    },
  );

  // ── Create module ──────────────────────────────────────────────────────────
  app.post(
    '/admin/courses/:id/modules',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
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
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
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
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
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
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteModule(id);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Create lesson ──────────────────────────────────────────────────────────
  app.post(
    '/admin/modules/:id/lessons',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(createLessonSchema, req.body, reply);
      if (!input) return;
      const lesson = await createLesson(id, input);
      return reply.status(201).send({ success: true, data: lesson });
    },
  );

  // ── Update lesson ──────────────────────────────────────────────────────────
  app.patch(
    '/admin/lessons/:id',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const input = validate(updateLessonSchema, req.body, reply);
      if (!input) return;
      const lesson = await updateLesson(id, input);
      return reply.send({ success: true, data: lesson });
    },
  );

  // ── Reorder lessons ────────────────────────────────────────────────────────
  app.post(
    '/admin/modules/:id/lessons/reorder',
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
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
    { preHandler: [authenticate, requireRoleOrPermission(['admin', 'instructor'], 'courses.manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await deleteLesson(id);
      return reply.send({ success: true, data: result });
    },
  );
}
