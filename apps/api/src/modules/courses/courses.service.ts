import { eq, and, count, asc, inArray, gt, isNull, or } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { signBunnyUrl, signBunnyFileUrl } from '../../lib/bunny.js';
import {
  courses,
  modules,
  lessons,
  lessonProgress,
  batchCourses,
  batchEnrollments,
  users,
} from '../../../drizzle/schema.js';
import type {
  CreateCourseInput,
  UpdateCourseInput,
  CreateModuleInput,
  UpdateModuleInput,
  CreateLessonInput,
  UpdateLessonInput,
  UpdateProgressInput,
  ListCoursesInput,
} from './courses.schema.js';

function notFound(entity = 'Course') {
  return Object.assign(new Error(`${entity} not found`), {
    statusCode: 404,
    code: `${entity.toUpperCase().replace(/ /g, '_')}_NOT_FOUND`,
  });
}

function forbidden(msg: string) {
  return Object.assign(new Error(msg), { statusCode: 403, code: 'FORBIDDEN' });
}

// ── Course access gate ─────────────────────────────────────────────────────────
// A student gets access only when ALL of: account active, verified, AND
// enrolled (active, non-expired) in a batch carrying this course. Each failure
// mode gets a distinct code so the app/mobile UI can show the right message.
function denied(code: string, msg: string) {
  return Object.assign(new Error(msg), { statusCode: 403, code });
}

async function assertEnrolled(userId: string, courseId: string): Promise<void> {
  const [account] = await db
    .select({ isActive: users.isActive, verificationStatus: users.verificationStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) throw denied('ACCOUNT_NOT_FOUND', 'Account not found');
  if (!account.isActive) throw denied('ACCOUNT_SUSPENDED', 'Your account has been suspended');
  if (account.verificationStatus !== 'verified') {
    throw denied('NOT_VERIFIED', 'Your account is pending verification — you cannot access courses yet');
  }

  const now = new Date();
  const [row] = await db
    .select({ id: batchCourses.courseId })
    .from(batchCourses)
    .innerJoin(
      batchEnrollments,
      and(
        eq(batchEnrollments.batchId, batchCourses.batchId),
        eq(batchEnrollments.userId, userId),
        eq(batchEnrollments.status, 'active'),
        or(isNull(batchEnrollments.expiresAt), gt(batchEnrollments.expiresAt, now)),
      ),
    )
    .where(eq(batchCourses.courseId, courseId))
    .limit(1);
  if (row) return;

  // Distinguish "never enrolled" from "enrolled but subscription expired" for a clearer message.
  const [expired] = await db
    .select({ id: batchCourses.courseId })
    .from(batchCourses)
    .innerJoin(
      batchEnrollments,
      and(
        eq(batchEnrollments.batchId, batchCourses.batchId),
        eq(batchEnrollments.userId, userId),
        eq(batchEnrollments.status, 'active'),
      ),
    )
    .where(eq(batchCourses.courseId, courseId))
    .limit(1);
  if (expired) throw denied('SUBSCRIPTION_EXPIRED', 'Your access to this batch has expired — contact admissions to renew');

  throw denied('NOT_ENROLLED', 'You are not enrolled in a batch that includes this course');
}

// ── Check drip unlock: module is unlocked for today ──────────────────────────
function isDripUnlocked(unlockDate: Date | null | undefined): boolean {
  if (!unlockDate) return true; // no date = always unlocked
  return new Date() >= unlockDate;
}

// ── List courses ──────────────────────────────────────────────────────────────
export async function listCourses(input: ListCoursesInput, userId: string, role: string) {
  const { page, limit, subject, batchId } = input;
  const offset = (page - 1) * limit;

  // Students only see courses in their enrolled batches
  if (role === 'student') {
    const enrolledBatches = await db
      .select({ batchId: batchEnrollments.batchId })
      .from(batchEnrollments)
      .where(and(eq(batchEnrollments.userId, userId), eq(batchEnrollments.status, 'active')));

    if (enrolledBatches.length === 0) return { items: [], total: 0 };

    const batchIds = enrolledBatches.map((e) => e.batchId);

    const courseIds = await db
      .selectDistinct({ courseId: batchCourses.courseId })
      .from(batchCourses)
      .where(inArray(batchCourses.batchId, batchIds));

    if (courseIds.length === 0) return { items: [], total: 0 };

    const ids = courseIds.map((r) => r.courseId);
    const conditions = [inArray(courses.id, ids), eq(courses.isPublished, true)];
    if (subject) conditions.push(eq(courses.subject, subject));

    const where = and(...conditions);
    const [{ total }] = await db.select({ total: count() }).from(courses).where(where);
    const items = await db.select().from(courses).where(where).limit(limit).offset(offset);
    return { items, total };
  }

  // Admin / instructor: full list
  const conditions = [];
  if (subject) conditions.push(eq(courses.subject, subject));
  if (input.isPublished !== undefined) conditions.push(eq(courses.isPublished, input.isPublished));
  if (batchId) {
    const courseIds = await db
      .select({ courseId: batchCourses.courseId })
      .from(batchCourses)
      .where(eq(batchCourses.batchId, batchId));
    if (courseIds.length === 0) return { items: [], total: 0 };
    conditions.push(inArray(courses.id, courseIds.map((r) => r.courseId)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(courses).where(where);
  const items = await db.select().from(courses).where(where).limit(limit).offset(offset);
  return { items, total };
}

// ── Get course with modules (and lesson count per module) ─────────────────────
export async function getCourseDetail(courseId: string, userId: string, role: string) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw notFound();
  if (!course.isPublished && role === 'student') throw notFound();

  if (role === 'student') await assertEnrolled(userId, courseId);

  const moduleList = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.order));

  // Annotate each module with unlock status and lesson count
  const enriched = await Promise.all(
    moduleList.map(async (mod) => {
      const [{ lessonCount }] = await db
        .select({ lessonCount: count() })
        .from(lessons)
        .where(eq(lessons.moduleId, mod.id));

      return {
        ...mod,
        isUnlocked: isDripUnlocked(mod.unlockDate),
        lessonCount,
      };
    }),
  );

  return { ...course, modules: enriched };
}

// ── Get module with its lessons (with drip + progress) ────────────────────────
export async function getModuleLessons(moduleId: string, userId: string, role: string) {
  const [mod] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);

  if (!mod) throw notFound('Module');

  // Drip check for students
  if (role === 'student' && !isDripUnlocked(mod.unlockDate)) {
    throw forbidden('This module is not yet available');
  }

  if (role === 'student') await assertEnrolled(userId, mod.courseId);

  const lessonList = await db
    .select()
    .from(lessons)
    .where(eq(lessons.moduleId, moduleId))
    .orderBy(asc(lessons.order));

  // Attach progress for student
  let progressMap: Record<string, { watchedSeconds: number; isCompleted: boolean }> = {};
  if (role === 'student' && lessonList.length > 0) {
    const progRows = await db
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          inArray(lessonProgress.lessonId, lessonList.map((l) => l.id)),
        ),
      );
    progressMap = Object.fromEntries(
      progRows.map((p) => [p.lessonId, { watchedSeconds: p.watchedSeconds, isCompleted: p.isCompleted }]),
    );
  }

  return lessonList.map((lesson) => ({
    ...lesson,
    // Strip raw storage IDs from student-facing response; they get a signed URL separately
    bunnyVideoId: role === 'student' ? undefined : lesson.bunnyVideoId,
    bunnyLibraryId: role === 'student' ? undefined : lesson.bunnyLibraryId,
    progress: progressMap[lesson.id] ?? { watchedSeconds: 0, isCompleted: false },
  }));
}

// ── Get signed watch URL for a lesson ────────────────────────────────────────
export async function getLessonWatchUrl(lessonId: string, userId: string, role: string) {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) throw notFound('Lesson');

  // Verify module drip + enrollment for students
  if (role === 'student') {
    const [mod] = await db.select().from(modules).where(eq(modules.id, lesson.moduleId)).limit(1);
    if (!mod) throw notFound('Module');
    if (!isDripUnlocked(mod.unlockDate)) throw forbidden('This module is not yet available');
    await assertEnrolled(userId, mod.courseId);
  }

  if (lesson.type === 'video' && lesson.bunnyVideoId) {
    return { type: 'video', url: signBunnyUrl(lesson.bunnyVideoId), expiresIn: 7200 };
  }

  if ((lesson.type === 'pdf' || lesson.type === 'audio') && lesson.fileUrl) {
    const path = new URL(lesson.fileUrl).pathname;
    return { type: lesson.type, url: signBunnyFileUrl(path, 3600), expiresIn: 3600 };
  }

  throw Object.assign(new Error('No media attached to this lesson'), { statusCode: 404, code: 'NO_MEDIA' });
}

// ── Update lesson watch progress ──────────────────────────────────────────────
export async function updateProgress(lessonId: string, userId: string, data: UpdateProgressInput) {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) throw notFound('Lesson');

  const isCompleted = data.isCompleted ?? (lesson.duration ? data.watchedSeconds >= lesson.duration * 0.9 : false);

  const [progress] = await db
    .insert(lessonProgress)
    .values({ userId, lessonId, watchedSeconds: data.watchedSeconds, isCompleted })
    .onConflictDoUpdate({
      target: [lessonProgress.userId, lessonProgress.lessonId],
      set: {
        watchedSeconds: data.watchedSeconds,
        isCompleted,
        lastWatchedAt: new Date(),
      },
    })
    .returning();

  return progress!;
}

// ── Admin: create course ──────────────────────────────────────────────────────
export async function createCourse(data: CreateCourseInput, createdBy: string) {
  const [course] = await db.insert(courses).values({ ...data, createdBy }).returning();
  return course!;
}

// ── Admin: update course ──────────────────────────────────────────────────────
export async function updateCourse(courseId: string, data: UpdateCourseInput) {
  const [updated] = await db
    .update(courses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(courses.id, courseId))
    .returning();
  if (!updated) throw notFound();
  return updated;
}

// ── Admin: create module ──────────────────────────────────────────────────────
export async function createModule(courseId: string, data: CreateModuleInput) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw notFound();

  const [mod] = await db
    .insert(modules)
    .values({
      courseId,
      ...data,
      unlockDate: data.unlockDate ? new Date(data.unlockDate) : null,
    })
    .returning();
  return mod!;
}

// ── Admin: update module ──────────────────────────────────────────────────────
export async function updateModule(moduleId: string, data: UpdateModuleInput) {
  const [updated] = await db
    .update(modules)
    .set({
      ...data,
      unlockDate: data.unlockDate ? new Date(data.unlockDate) : undefined,
    })
    .where(eq(modules.id, moduleId))
    .returning();
  if (!updated) throw notFound('Module');
  return updated;
}

// ── Admin: reorder modules ────────────────────────────────────────────────────
export async function reorderModules(items: { id: string; order: number }[]) {
  await db.transaction(async (tx) => {
    for (const { id, order } of items) {
      await tx.update(modules).set({ order }).where(eq(modules.id, id));
    }
  });
  return { reordered: items.length };
}

// ── Admin: delete module ──────────────────────────────────────────────────────
export async function deleteModule(moduleId: string) {
  const result = await db.delete(modules).where(eq(modules.id, moduleId)).returning();
  if (result.length === 0) throw notFound('Module');
  return { deleted: true };
}

// ── Admin: create lesson ──────────────────────────────────────────────────────
export async function createLesson(moduleId: string, data: CreateLessonInput) {
  const [mod] = await db.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!mod) throw notFound('Module');

  const [lesson] = await db.insert(lessons).values({ moduleId, ...data }).returning();
  return lesson!;
}

// ── Admin: update lesson ──────────────────────────────────────────────────────
export async function updateLesson(lessonId: string, data: UpdateLessonInput) {
  const [updated] = await db
    .update(lessons)
    .set(data)
    .where(eq(lessons.id, lessonId))
    .returning();
  if (!updated) throw notFound('Lesson');
  return updated;
}

// ── Admin: delete lesson ──────────────────────────────────────────────────────
export async function deleteLesson(lessonId: string) {
  const result = await db.delete(lessons).where(eq(lessons.id, lessonId)).returning();
  if (result.length === 0) throw notFound('Lesson');
  return { deleted: true };
}

// ── Admin: reorder lessons ────────────────────────────────────────────────────
export async function reorderLessons(items: { id: string; order: number }[]) {
  await db.transaction(async (tx) => {
    for (const { id, order } of items) {
      await tx.update(lessons).set({ order }).where(eq(lessons.id, id));
    }
  });
  return { reordered: items.length };
}
