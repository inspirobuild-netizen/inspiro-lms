import { eq, and, asc, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { batches, courses, modules, lessons, exams, questions } from '../../../drizzle/schema.js';
import type { CreateModuleInput } from './courses.schema.js';

/**
 * Per-batch content management.
 *
 * Content is managed PER BATCH: each batch carries its own modules and
 * lessons. Modules with batchId null are a course's MASTER content — the
 * template a new batch copies from, and the fallback students see when their
 * batch has nothing of its own yet.
 */

function notFound(entity = 'Batch') {
  return Object.assign(new Error(`${entity} not found`), {
    statusCode: 404,
    code: `${entity.toUpperCase()}_NOT_FOUND`,
  });
}

function bad(message: string, code: string) {
  return Object.assign(new Error(message), { statusCode: 400, code });
}

/** The batch's own modules with nested lessons — the admin CMS view. */
export async function getBatchContent(batchId: string) {
  const [batch] = await db
    .select({ id: batches.id, name: batches.name, courseId: batches.courseId, courseTitle: courses.title })
    .from(batches)
    .innerJoin(courses, eq(courses.id, batches.courseId))
    .where(eq(batches.id, batchId))
    .limit(1);
  if (!batch) throw notFound();

  const moduleList = await db
    .select()
    .from(modules)
    .where(eq(modules.batchId, batchId))
    .orderBy(asc(modules.order));
  const moduleIds = moduleList.map((m) => m.id);

  const lessonList = moduleIds.length
    ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds)).orderBy(asc(lessons.order))
    : [];
  const byModule = new Map<string, typeof lessonList>();
  for (const l of lessonList) {
    const arr = byModule.get(l.moduleId) ?? [];
    arr.push(l);
    byModule.set(l.moduleId, arr);
  }

  return {
    batch,
    modules: moduleList.map((m) => ({
      ...m,
      lessons: byModule.get(m.id) ?? [],
      lessonCount: (byModule.get(m.id) ?? []).length,
    })),
  };
}

/** Creates a module that belongs to one batch; courseId derives from it. */
export async function createBatchModule(batchId: string, data: CreateModuleInput) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) throw notFound();
  const [mod] = await db
    .insert(modules)
    .values({
      courseId: batch.courseId,
      batchId,
      ...data,
      unlockDate: data.unlockDate ? new Date(data.unlockDate) : null,
    })
    .returning();
  return mod!;
}

/**
 * Copies content into a batch so nothing is uploaded or configured twice.
 * Source: another batch, or a course's master content.
 *
 * Modules, lessons, and each lesson's topic exam WITH its questions are
 * copied. Media travels by reference — bunnyVideoId / fileUrl point at the
 * same stored video or PDF, so nothing is re-uploaded and no storage is
 * duplicated. Copied exams arrive as DRAFTS: a new batch's papers must not go
 * live merely because the old batch's were.
 *
 * Appends after any existing modules rather than refusing, so a second source
 * can be pulled in later.
 */
export async function copyContentToBatch(
  targetBatchId: string,
  source: { fromBatchId?: string; fromCourseId?: string },
  staffId: string,
) {
  const [target] = await db.select().from(batches).where(eq(batches.id, targetBatchId)).limit(1);
  if (!target) throw notFound();

  let sourceModules: (typeof modules.$inferSelect)[];
  if (source.fromBatchId) {
    if (source.fromBatchId === targetBatchId) {
      throw bad('Source and destination are the same batch', 'SAME_BATCH');
    }
    sourceModules = await db
      .select()
      .from(modules)
      .where(eq(modules.batchId, source.fromBatchId))
      .orderBy(asc(modules.order));
  } else if (source.fromCourseId) {
    sourceModules = await db
      .select()
      .from(modules)
      .where(and(eq(modules.courseId, source.fromCourseId), isNull(modules.batchId)))
      .orderBy(asc(modules.order));
  } else {
    throw bad('Choose a source batch or course', 'NO_SOURCE');
  }
  if (sourceModules.length === 0) {
    throw bad('The chosen source has no content to copy', 'SOURCE_EMPTY');
  }

  const srcModuleIds = sourceModules.map((m) => m.id);
  const srcLessons = await db
    .select()
    .from(lessons)
    .where(inArray(lessons.moduleId, srcModuleIds))
    .orderBy(asc(lessons.order));
  const srcLessonIds = srcLessons.map((l) => l.id);

  const srcExams = srcLessonIds.length
    ? await db.select().from(exams).where(inArray(exams.lessonId, srcLessonIds))
    : [];
  const srcExamIds = srcExams.map((e) => e.id);
  const srcQuestions = srcExamIds.length
    ? await db.select().from(questions).where(inArray(questions.examId, srcExamIds))
    : [];

  // New modules append after whatever the batch already has.
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max("order"), -1)` })
    .from(modules)
    .where(eq(modules.batchId, targetBatchId));

  return db.transaction(async (tx) => {
    let copiedLessons = 0;
    let copiedExams = 0;
    let copiedQuestions = 0;

    for (let i = 0; i < sourceModules.length; i++) {
      const sm = sourceModules[i]!;
      const [newModule] = await tx
        .insert(modules)
        .values({
          courseId: target.courseId,
          batchId: targetBatchId,
          title: sm.title,
          order: Number(maxOrder) + 1 + i,
          unlockDate: sm.unlockDate,
        })
        .returning();

      for (const sl of srcLessons.filter((l) => l.moduleId === sm.id)) {
        const [newLesson] = await tx
          .insert(lessons)
          .values({
            moduleId: newModule!.id,
            title: sl.title,
            type: sl.type,
            bunnyVideoId: sl.bunnyVideoId,
            bunnyLibraryId: sl.bunnyLibraryId,
            fileUrl: sl.fileUrl,
            duration: sl.duration,
            order: sl.order,
            isDownloadable: sl.isDownloadable,
          })
          .returning();
        copiedLessons++;

        for (const se of srcExams.filter((e) => e.lessonId === sl.id)) {
          const [newExam] = await tx
            .insert(exams)
            .values({
              title: se.title,
              subject: se.subject,
              type: se.type,
              durationMins: se.durationMins,
              marksPerQuestion: se.marksPerQuestion,
              negMarks: se.negMarks,
              passPercent: se.passPercent,
              maxAttempts: se.maxAttempts,
              lessonId: newLesson!.id,
              isPublished: false, // drafts on arrival — publish deliberately
              createdBy: staffId,
            })
            .returning();
          copiedExams++;

          const qs = srcQuestions.filter((q) => q.examId === se.id);
          if (qs.length) {
            await tx.insert(questions).values(
              qs.map((q) => ({
                examId: newExam!.id,
                subject: q.subject,
                chapter: q.chapter,
                difficulty: q.difficulty,
                body: q.body,
                options: q.options,
                correctIndex: q.correctIndex,
                explanation: q.explanation,
                imageUrl: q.imageUrl,
                tags: q.tags,
              })),
            );
            copiedQuestions += qs.length;
          }
        }
      }
    }

    return {
      copiedModules: sourceModules.length,
      copiedLessons,
      copiedExams,
      copiedQuestions,
    };
  });
}
