import { eq, and, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { batches, modules, lessons } from '../../../drizzle/schema.js';
import { deleteBunnyVideo } from '../media/media.service.js';
import { deleteDoc } from '../../lib/local-storage.js';
import { logger } from '../../lib/logger.js';

/**
 * Deleting content should not leave paid-for media behind.
 *
 * A video uploaded through the admin panel lives in Bunny and is billed every
 * month whether or not any lesson still points at it. Deleting the lesson row
 * used to orphan it silently, so the bill kept growing with content nobody
 * could reach.
 *
 * The complication is that copying a batch shares media BY REFERENCE — the
 * copied lesson carries the same bunnyVideoId, so the same file backs several
 * batches on purpose. Deleting one batch must therefore never delete a video
 * another batch is still teaching from. Everything here is reference-counted
 * against the rest of the database before anything is removed.
 *
 * YouTube-hosted lessons are skipped entirely: the video belongs to the
 * academy's channel and long outlives any one batch. Deleting a lesson is not
 * consent to delete from the channel.
 */

export type MediaPlan = {
  /** Bunny videos that no surviving lesson would reference. */
  orphanVideos: string[];
  /** Notes files on our own volume that no surviving lesson would reference. */
  orphanDocs: string[];
  /** Media kept because other lessons still use it — shown in the confirmation. */
  sharedVideos: number;
  sharedDocs: number;
  /** Lessons in scope, for the confirmation copy. */
  lessonCount: number;
  youtubeCount: number;
};

/** Every lesson id under a batch, a module, a course's master, or one lesson. */
export async function lessonIdsForScope(scope:
  | { kind: 'lesson'; id: string }
  | { kind: 'module'; id: string }
  | { kind: 'batch'; id: string }
  | { kind: 'course'; id: string },
): Promise<string[]> {
  if (scope.kind === 'lesson') return [scope.id];

  let moduleIds: string[];
  if (scope.kind === 'module') {
    moduleIds = [scope.id];
  } else if (scope.kind === 'batch') {
    const rows = await db.select({ id: modules.id }).from(modules).where(eq(modules.batchId, scope.id));
    moduleIds = rows.map((r) => r.id);
  } else {
    // A course covers its master modules AND every module under its batches,
    // because deleting the course takes all of them.
    const rows = await db
      .select({ id: modules.id })
      .from(modules)
      .leftJoin(batches, eq(batches.id, modules.batchId))
      .where(sql`${modules.courseId} = ${scope.id} OR ${batches.courseId} = ${scope.id}`);
    moduleIds = rows.map((r) => r.id);
  }

  if (moduleIds.length === 0) return [];
  const rows = await db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.moduleId, moduleIds));
  return rows.map((r) => r.id);
}

/**
 * Works out which media would be orphaned by removing these lessons, WITHOUT
 * changing anything. The admin panel calls this to write an honest
 * confirmation — "3 videos deleted, 2 kept because another batch uses them" —
 * rather than a vague warning.
 */
export async function planMediaCleanup(lessonIds: string[]): Promise<MediaPlan> {
  const empty: MediaPlan = {
    orphanVideos: [], orphanDocs: [], sharedVideos: 0, sharedDocs: 0,
    lessonCount: 0, youtubeCount: 0,
  };
  if (lessonIds.length === 0) return empty;

  const doomed = await db
    .select({
      id: lessons.id,
      provider: lessons.videoProvider,
      bunnyVideoId: lessons.bunnyVideoId,
      fileUrl: lessons.fileUrl,
    })
    .from(lessons)
    .where(inArray(lessons.id, lessonIds));
  if (doomed.length === 0) return empty;

  const youtubeCount = doomed.filter((l) => l.provider === 'youtube').length;

  // Only self-hosted media is ours to delete. A YouTube id points at the
  // academy's channel, not at storage we are billed for.
  const videoIds = [...new Set(
    doomed.filter((l) => l.provider !== 'youtube' && l.bunnyVideoId).map((l) => l.bunnyVideoId!),
  )];
  // Notes uploaded through the panel are bare filenames. A legacy row holding
  // a full URL points at a shared pull-zone path and is left alone.
  const docs = [...new Set(
    doomed.filter((l) => l.fileUrl && !l.fileUrl.includes('://')).map((l) => l.fileUrl!),
  )];

  const survivingUsers = async (column: typeof lessons.bunnyVideoId | typeof lessons.fileUrl, values: string[]) => {
    if (values.length === 0) return new Set<string>();
    const rows = await db
      .selectDistinct({ v: column })
      .from(lessons)
      .where(and(inArray(column, values), notInArray(lessons.id, lessonIds)));
    return new Set(rows.map((r) => r.v!).filter(Boolean));
  };

  const stillUsedVideos = await survivingUsers(lessons.bunnyVideoId, videoIds);
  const stillUsedDocs = await survivingUsers(lessons.fileUrl, docs);

  const orphanVideos = videoIds.filter((v) => !stillUsedVideos.has(v));
  const orphanDocs = docs.filter((d) => !stillUsedDocs.has(d));

  return {
    orphanVideos,
    orphanDocs,
    sharedVideos: videoIds.length - orphanVideos.length,
    sharedDocs: docs.length - orphanDocs.length,
    lessonCount: doomed.length,
    youtubeCount,
  };
}

/**
 * Actually removes the orphaned media. Call AFTER the database rows are gone.
 *
 * Order matters and is deliberate. Deleting from Bunny first would, if the
 * database delete then failed, leave lessons pointing at videos that no longer
 * exist — students hitting dead classes. Doing it in this order can at worst
 * leave a paid-for orphan, which costs money but breaks nothing, and is
 * recoverable by re-running the sweep.
 *
 * Never throws: a storage failure must not turn a completed deletion into an
 * error the admin sees as "it did not work". Failures are logged and counted.
 */
export async function purgeMedia(plan: MediaPlan): Promise<{ videosDeleted: number; docsDeleted: number; failed: number }> {
  let videosDeleted = 0;
  let docsDeleted = 0;
  let failed = 0;

  for (const guid of plan.orphanVideos) {
    try {
      await deleteBunnyVideo(guid);
      videosDeleted++;
    } catch (err) {
      failed++;
      logger.error({ err, guid }, 'bunny video delete failed — orphan left in storage');
    }
  }

  for (const filename of plan.orphanDocs) {
    try {
      if (await deleteDoc(filename)) docsDeleted++;
    } catch (err) {
      failed++;
      logger.error({ err, filename }, 'notes file delete failed');
    }
  }

  return { videosDeleted, docsDeleted, failed };
}

/** Counts a course's master modules and its batch modules, for confirmations. */
export async function courseMasterLessonIds(courseId: string): Promise<string[]> {
  const mods = await db
    .select({ id: modules.id })
    .from(modules)
    .where(and(eq(modules.courseId, courseId), isNull(modules.batchId)));
  if (mods.length === 0) return [];
  const rows = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(inArray(lessons.moduleId, mods.map((m) => m.id)));
  return rows.map((r) => r.id);
}
