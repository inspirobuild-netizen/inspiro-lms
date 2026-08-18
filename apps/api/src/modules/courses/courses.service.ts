import { eq, and, count, asc, inArray, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { signBunnyMp4Url, signBunnyFileUrl, orderResolutions } from '../../lib/bunny.js';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { getBunnyVideoStatus } from '../media/media.service.js';
import {
  admissions,
  courses,
  batches,
  enrollmentRequests,
  modules,
  lessons,
  lessonProgress,
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
    .select({ id: batches.courseId })
    .from(batches)
    .innerJoin(
      batchEnrollments,
      and(
        eq(batchEnrollments.batchId, batches.id),
        eq(batchEnrollments.userId, userId),
        eq(batchEnrollments.status, 'active'),
        or(isNull(batchEnrollments.expiresAt), gt(batchEnrollments.expiresAt, now)),
      ),
    )
    .where(eq(batches.courseId, courseId))
    .limit(1);
  if (row) return;

  // Distinguish "never enrolled" from "enrolled but subscription expired" for a clearer message.
  const [expired] = await db
    .select({ id: batches.courseId })
    .from(batches)
    .innerJoin(
      batchEnrollments,
      and(
        eq(batchEnrollments.batchId, batches.id),
        eq(batchEnrollments.userId, userId),
        eq(batchEnrollments.status, 'active'),
      ),
    )
    .where(eq(batches.courseId, courseId))
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

  // Students in the marketing "catalog" (browsing to enroll) see every
  // published course, title/subject/description/fee only — no syllabus, no
  // enrollment check. This is a distinct, explicit code path (not just a UI
  // choice) so a direct API call can't be used to read locked content.
  if (role === 'student' && input.scope === 'catalog') {
    const conditions = [eq(courses.isPublished, true)];
    if (subject) conditions.push(eq(courses.subject, subject));
    const where = and(...conditions);
    const [{ total }] = await db.select({ total: count() }).from(courses).where(where);
    const items = await db
      .select({ id: courses.id, title: courses.title, subject: courses.subject, description: courses.description, thumbnailUrl: courses.thumbnailUrl, feeAmount: courses.feeAmount })
      .from(courses)
      .where(where)
      .limit(limit)
      .offset(offset);
    return { items, total };
  }

  // Students (default): only courses reachable via an active batch enrollment.
  if (role === 'student') {
    const courseIds = await db
      .selectDistinct({ courseId: batches.courseId })
      .from(batches)
      .innerJoin(batchEnrollments, and(eq(batchEnrollments.batchId, batches.id), eq(batchEnrollments.status, 'active')))
      .where(eq(batchEnrollments.userId, userId));

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
    const [row] = await db.select({ courseId: batches.courseId }).from(batches).where(eq(batches.id, batchId)).limit(1);
    if (!row) return { items: [], total: 0 };
    conditions.push(eq(courses.id, row.courseId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(courses).where(where);
  const items = await db.select().from(courses).where(where).limit(limit).offset(offset);
  return { items, total };
}

// ── Per-course progress for the signed-in student ─────────────────────────────
/**
 * completed / total lessons for every course the student can reach via an
 * active batch enrolment. One grouped query rather than N per-course counts.
 *
 * Courses with no lessons yet report total 0 / percent 0 — the caller decides
 * whether to show anything, rather than this inventing a number.
 */
export async function getMyCourseProgress(userId: string) {
  const rows = await db
    .select({
      courseId: modules.courseId,
      total: count(lessons.id),
      completed: sql<number>`count(*) filter (where ${lessonProgress.isCompleted})`,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    // Only this student's progress rows may join, so `completed` can't count
    // another student's activity.
    .leftJoin(
      lessonProgress,
      and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)),
    )
    .where(
      inArray(
        modules.courseId,
        db
          .selectDistinct({ courseId: batches.courseId })
          .from(batches)
          .innerJoin(
            batchEnrollments,
            and(eq(batchEnrollments.batchId, batches.id), eq(batchEnrollments.status, 'active')),
          )
          .where(eq(batchEnrollments.userId, userId)),
      ),
    )
    .groupBy(modules.courseId);

  return rows.map((r) => {
    const total = Number(r.total);
    const completed = Number(r.completed);
    return {
      courseId: r.courseId,
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });
}

// ── Batches under a course (admin picker + mobile catalog) ─────────────────────
export async function listCourseBatches(courseId: string) {
  return db.select().from(batches).where(eq(batches.courseId, courseId)).orderBy(asc(batches.startDate));
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

  const moduleIds = moduleList.map((m) => m.id);

  // Every lesson for the course in ONE query, then grouped in memory. This
  // used to be a COUNT per module on the server and a request per module from
  // the app — 1 + N round trips before a student saw anything. Courses have
  // tens of lessons, not thousands, so one fetch is cheaper than the chatter.
  const lessonList = moduleIds.length
    ? await db
        .select()
        .from(lessons)
        .where(inArray(lessons.moduleId, moduleIds))
        .orderBy(asc(lessons.order))
    : [];

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

  const byModule = new Map<string, typeof lessonList>();
  for (const l of lessonList) {
    const arr = byModule.get(l.moduleId) ?? [];
    arr.push(l);
    byModule.set(l.moduleId, arr);
  }

  const enriched = moduleList.map((mod) => {
    const isUnlocked = isDripUnlocked(mod.unlockDate);
    const mine = byModule.get(mod.id) ?? [];

    return {
      ...mod,
      isUnlocked,
      lessonCount: mine.length,
      lessons: mine.map((lesson) => ({
        ...lesson,
        // Raw storage ids never go to students; they get a signed URL instead.
        bunnyVideoId: role === 'student' ? undefined : lesson.bunnyVideoId,
        bunnyLibraryId: role === 'student' ? undefined : lesson.bunnyLibraryId,
        // A locked module's lessons are listed so the student can see what is
        // coming, but the watch-url endpoint still refuses them.
        locked: role === 'student' && !isUnlocked,
        progress: progressMap[lesson.id] ?? { watchedSeconds: 0, isCompleted: false },
      })),
    };
  });

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


const WATCH_URL_TTL = 7200;

// Bunny's rendition list never changes once encoding finishes, so cache it and
// keep the watch-url endpoint from making a Bunny API call on every play.
async function getCachedResolutions(videoId: string): Promise<string[]> {
  const key = `bunnyres:${videoId}`;
  const cached = await redis.get(key);
  if (cached) return cached ? cached.split(',').filter(Boolean) : [];

  let ordered: string[] = [];
  try {
    const { availableResolutions } = await getBunnyVideoStatus(videoId);
    ordered = orderResolutions(availableResolutions ?? '');
  } catch (err) {
    // A Bunny outage should not take playback down for videos we have already
    // resolved, but there is nothing to fall back to on a cold cache.
    logger.warn({ err, videoId }, 'Could not read Bunny renditions');
    return [];
  }

  // Only cache a real answer — caching an empty list would pin a still-encoding
  // video as unplayable for the whole TTL.
  if (ordered.length > 0) await redis.set(key, ordered.join(','), 'EX', 60 * 60 * 24 * 30);
  return ordered;
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
    const videoId = lesson.bunnyVideoId;
    const resolutions = await getCachedResolutions(videoId);

    if (resolutions.length === 0) {
      throw Object.assign(new Error('This video is still being processed. Please try again shortly.'), {
        statusCode: 409,
        code: 'VIDEO_NOT_READY',
      });
    }

    // Best first. The player defaults to [0] and offers the rest for manual
    // switching, since MP4 gives us no adaptive bitrate.
    const qualities = resolutions.map((r) => ({
      label: r,
      url: signBunnyMp4Url(videoId, r, WATCH_URL_TTL),
    }));

    // Where the student stopped last time, so the player can pick up there.
    const [seen] = await db
      .select({ watchedSeconds: lessonProgress.watchedSeconds, isCompleted: lessonProgress.isCompleted })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.lessonId, lessonId), eq(lessonProgress.userId, userId)))
      .limit(1);

    // Resuming a lesson already finished would drop the student at the end
    // credits rather than letting them rewatch it.
    const resumeSeconds = seen && !seen.isCompleted ? seen.watchedSeconds : 0;

    return {
      type: 'video',
      url: qualities[0]!.url,
      qualities,
      resumeSeconds,
      expiresIn: WATCH_URL_TTL,
    };
  }

  if ((lesson.type === 'pdf' || lesson.type === 'audio') && lesson.fileUrl) {
    // Notes uploaded through the admin panel are stored on our own disk and
    // recorded as a bare filename. They are paid content, so rather than a
    // public or signed static URL the client is pointed at an endpoint that
    // re-checks enrolment on every request — a leaked link is then worth
    // nothing to anyone not enrolled.
    if (!lesson.fileUrl.includes('://')) {
      return { type: lesson.type, url: `/api/v1/lessons/${lessonId}/file`, expiresIn: 0 };
    }

    // Legacy rows still holding a full Bunny pull-zone URL.
    const path = new URL(lesson.fileUrl).pathname;
    return { type: lesson.type, url: signBunnyFileUrl(path, 3600), expiresIn: 3600 };
  }

  throw Object.assign(new Error('No media attached to this lesson'), { statusCode: 404, code: 'NO_MEDIA' });
}


/**
 * Resolves a notes lesson to its stored filename, applying exactly the same
 * checks as getLessonWatchUrl — drip, enrolment, verification, expiry. The
 * streaming route calls this so the file can never be reached by a student
 * who could not open the lesson itself.
 */
export async function getLessonFileName(lessonId: string, userId: string, role: string): Promise<string> {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) throw notFound('Lesson');

  if (role === 'student') {
    const [mod] = await db.select().from(modules).where(eq(modules.id, lesson.moduleId)).limit(1);
    if (!mod) throw notFound('Module');
    if (!isDripUnlocked(mod.unlockDate)) throw forbidden('This module is not yet available');
    await assertEnrolled(userId, mod.courseId);
  }

  if (!lesson.fileUrl || lesson.fileUrl.includes('://')) {
    throw Object.assign(new Error('No notes attached to this lesson'), {
      statusCode: 404,
      code: 'NO_MEDIA',
    });
  }
  return lesson.fileUrl;
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
        // Last position, so the player resumes where the student stopped —
        // including when they rewind.
        watchedSeconds: data.watchedSeconds,
        // Completion is sticky. Writing the incoming value directly meant
        // that rewatching a finished lesson from the middle marked it
        // unfinished again, and the course dropped from 100% back to 0%.
        isCompleted: sql`${lessonProgress.isCompleted} OR ${isCompleted}`,
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

// ── Admin: delete course ──────────────────────────────────────────────────────
/**
 * Permanently delete a course, but only when nothing depends on it.
 *
 * Course is the master of the batch → enrolment chain, so this is the most
 * destructive delete in the system: modules, lessons and fee plans all CASCADE.
 * `batches.courseId` and `enrollmentRequests.courseId` are ON DELETE RESTRICT
 * (Postgres would reject with a raw FK error), and `admissions.courseId` is
 * SET NULL (which would silently orphan the admission's course). Each is
 * checked explicitly so the caller gets a sentence, not a constraint name.
 *
 * Students are never enrolled in a course directly — they enrol in a batch —
 * so "no students enrolled" is enforced by refusing any batch at all.
 */
export async function deleteCourse(courseId: string) {
  return db.transaction(async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!course) throw notFound();

    const [{ batchCount }] = await tx
      .select({ batchCount: count() })
      .from(batches)
      .where(eq(batches.courseId, courseId));
    if (batchCount > 0) {
      throw Object.assign(
        new Error(
          `This course has ${batchCount} batch${batchCount === 1 ? '' : 'es'} under it. Delete those first — students enrol in batches, so the batches carry the enrolments.`,
        ),
        { statusCode: 409, code: 'COURSE_HAS_BATCHES' },
      );
    }

    const [{ admitted }] = await tx
      .select({ admitted: count() })
      .from(admissions)
      .where(eq(admissions.courseId, courseId));
    if (admitted > 0) {
      throw Object.assign(
        new Error(
          `This course is referenced by ${admitted} admission record${admitted === 1 ? '' : 's'}. Unpublish it instead so the admission history stays intact.`,
        ),
        { statusCode: 409, code: 'COURSE_HAS_ADMISSIONS' },
      );
    }

    const [{ requests }] = await tx
      .select({ requests: count() })
      .from(enrollmentRequests)
      .where(eq(enrollmentRequests.courseId, courseId));
    if (requests > 0) {
      throw Object.assign(
        new Error(
          `This course has ${requests} enrolment request${requests === 1 ? '' : 's'} from the app. Resolve or reject them first.`,
        ),
        { statusCode: 409, code: 'COURSE_HAS_ENROLLMENT_REQUESTS' },
      );
    }

    // Modules → lessons and fee plans cascade from here.
    await tx.delete(courses).where(eq(courses.id, courseId));
    return { deleted: true, id: courseId, title: course.title };
  });
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
