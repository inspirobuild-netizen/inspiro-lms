import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { lessons, exams } from '../../../drizzle/schema.js';
import { signBunnyMp4Url, signBunnyFileUrl, orderResolutions } from '../../lib/bunny.js';
import { getBunnyVideoStatus } from '../media/media.service.js';

/**
 * What a staff member needs to check a lesson before students see it.
 *
 * Deliberately separate from the student watch-url. That path enforces
 * enrolment and drip dates, which is exactly right for a student and exactly
 * wrong here: a coordinator verifying next month's content is not enrolled in
 * the batch and the module is not unlocked yet, so the student path would
 * refuse them and the content would go out unchecked.
 *
 * It also reports encoding state honestly rather than erroring, so "not ready
 * yet" is distinguishable from "this upload failed" — the confusion that had
 * staff reporting a network fault when a video was simply still processing.
 */
export async function getLessonPreview(lessonId: string) {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) {
    throw Object.assign(new Error('Lesson not found'), { statusCode: 404, code: 'LESSON_NOT_FOUND' });
  }

  const base = { lessonId: lesson.id, title: lesson.title, type: lesson.type };

  if (lesson.type === 'exam') {
    const [exam] = await db.select().from(exams).where(eq(exams.lessonId, lessonId)).limit(1);
    return {
      ...base,
      kind: 'exam' as const,
      examId: exam?.id ?? null,
      isPublished: exam?.isPublished ?? false,
    };
  }

  if (lesson.type === 'pdf') {
    if (!lesson.fileUrl) return { ...base, kind: 'pdf' as const, ready: false, url: null };
    // Panel uploads are bare filenames served by our own authenticated route;
    // legacy rows hold a full pull-zone URL.
    const url = lesson.fileUrl.includes('://')
      ? signBunnyFileUrl(new URL(lesson.fileUrl).pathname, 1800)
      : `/api/v1/lessons/${lessonId}/file`;
    return { ...base, kind: 'pdf' as const, ready: true, url };
  }

  if (lesson.videoProvider === 'youtube') {
    return {
      ...base,
      kind: 'youtube' as const,
      ready: !!lesson.youtubeVideoId,
      youtubeVideoId: lesson.youtubeVideoId,
    };
  }

  if (!lesson.bunnyVideoId) {
    return { ...base, kind: 'video' as const, ready: false, state: 'no_upload' as const, qualities: [] };
  }

  // Straight from Bunny rather than the resolution cache: a preview exists to
  // tell the truth about this moment, and a cached "not ready" would keep
  // saying so after encoding finished.
  const status = await getBunnyVideoStatus(lesson.bunnyVideoId);
  const resolutions = orderResolutions(status.availableResolutions ?? '');

  if (resolutions.length === 0) {
    return {
      ...base,
      kind: 'video' as const,
      ready: false,
      state: status.status === 5 || status.status === 6 ? ('failed' as const) : ('encoding' as const),
      encodeProgress: status.encodeProgress ?? 0,
      qualities: [],
    };
  }

  return {
    ...base,
    kind: 'video' as const,
    ready: true,
    state: 'ready' as const,
    encodeProgress: 100,
    durationSeconds: status.length ?? null,
    qualities: resolutions.map((r) => ({ label: r, url: signBunnyMp4Url(lesson.bunnyVideoId!, r, 1800) })),
  };
}
