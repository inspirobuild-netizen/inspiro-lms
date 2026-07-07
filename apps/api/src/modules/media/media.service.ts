import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import { lessons } from '../../../drizzle/schema.js';
import { logger } from '../../lib/logger.js';
import type { BunnyWebhookPayload, CreateVideoInput } from './media.schema.js';

const BUNNY_API_BASE = 'https://video.bunnycdn.com';
const VIDEO_READY_STATUS = 3; // Bunny: all resolutions transcoded

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

function videoReadyKey(videoGuid: string): string {
  return `bunny:ready:${videoGuid}`;
}

// ── Verify Bunny webhook authenticity ─────────────────────────────────────────
// Bunny Stream webhooks carry no signature header, so the webhook URL we
// register with Bunny embeds our secret as ?token=… — we verify that.
// (A SHA256(secret+VideoGuid) header is also accepted for future-proofing.)
export function verifyBunnySignature(
  payload: BunnyWebhookPayload,
  signatureHeader: string | undefined,
  tokenQuery: string | undefined,
): boolean {
  const secret = process.env['BUNNY_WEBHOOK_SECRET'];
  if (!secret) {
    // If no secret configured, skip verification in dev
    if (process.env['NODE_ENV'] !== 'production') return true;
    throw new Error('BUNNY_WEBHOOK_SECRET not configured');
  }

  if (tokenQuery) {
    const a = Buffer.from(tokenQuery);
    const b = Buffer.from(secret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }

  if (signatureHeader) {
    const expected = crypto
      .createHash('sha256')
      .update(secret + payload.VideoGuid)
      .digest('hex');
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }

  return false;
}

// ── Create a video object in Bunny Stream ─────────────────────────────────────
// Returns the video GUID and the direct upload URL
export async function createBunnyVideo(input: CreateVideoInput): Promise<{
  videoGuid: string;
  uploadUrl: string;
  lessonId: string;
}> {
  const apiKey = requireEnv('BUNNY_STREAM_API_KEY');
  const libraryId = input.libraryId ?? requireEnv('BUNNY_STREAM_LIBRARY_ID');

  // 1. Create video object in Bunny
  const res = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: input.title }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(new Error(`Bunny API error: ${body}`), { statusCode: 502, code: 'BUNNY_API_ERROR' });
  }

  const data = (await res.json()) as { guid: string };
  const videoGuid = data.guid;

  // 2. Persist videoGuid on lesson immediately (before upload completes)
  const [updated] = await db
    .update(lessons)
    .set({ bunnyVideoId: videoGuid, bunnyLibraryId: libraryId })
    .where(eq(lessons.id, input.lessonId))
    .returning();

  if (!updated) {
    throw Object.assign(new Error('Lesson not found'), { statusCode: 404, code: 'LESSON_NOT_FOUND' });
  }

  // 3. Build the direct upload URL (client uploads directly to Bunny — no server relay)
  const uploadUrl = `${BUNNY_API_BASE}/library/${libraryId}/videos/${videoGuid}`;

  return { videoGuid, uploadUrl, lessonId: input.lessonId };
}

// ── Handle Bunny webhook ──────────────────────────────────────────────────────
export async function handleBunnyWebhook(payload: BunnyWebhookPayload): Promise<void> {
  const { VideoGuid, VideoLibraryId, Status, Title } = payload;

  logger.info({ videoGuid: VideoGuid, libraryId: VideoLibraryId, status: Status }, 'Bunny webhook received');

  if (Status === VIDEO_READY_STATUS) {
    // Mark video as ready in Redis — watch-url endpoint checks this
    await redis.set(videoReadyKey(VideoGuid), '1', 'EX', 60 * 60 * 24 * 30); // 30-day TTL

    // Find the lesson with this video and mark it with duration metadata if available
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.bunnyVideoId, VideoGuid))
      .limit(1);

    if (lesson) {
      logger.info({ lessonId: lesson.id, title: Title }, 'Bunny video ready — lesson unlocked for streaming');
      // Could dispatch a push notification here or update a status field
    }
  }

  if (Status === 5) {
    // Transcoding failed
    logger.error({ videoGuid: VideoGuid }, 'Bunny transcoding FAILED');
    await redis.set(`bunny:failed:${VideoGuid}`, '1', 'EX', 60 * 60 * 24 * 7);
  }
}

// ── Check if a video has finished transcoding ─────────────────────────────────
export async function isVideoReady(videoGuid: string): Promise<boolean> {
  const val = await redis.get(videoReadyKey(videoGuid));
  return val === '1';
}

// ── Get video status from Bunny API directly ──────────────────────────────────
export async function getBunnyVideoStatus(videoGuid: string): Promise<{
  status: number;
  statusText: string;
  storageSize: number;
  availableResolutions: string;
}> {
  const apiKey = requireEnv('BUNNY_STREAM_API_KEY');
  const libraryId = requireEnv('BUNNY_STREAM_LIBRARY_ID');

  const res = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${videoGuid}`, {
    headers: { AccessKey: apiKey },
  });

  if (!res.ok) {
    throw Object.assign(new Error('Video not found in Bunny'), { statusCode: 404, code: 'VIDEO_NOT_FOUND' });
  }

  const data = (await res.json()) as {
    status: number;
    storageSize: number;
    availableResolutions: string;
  };

  const statusText: Record<number, string> = {
    0: 'queued', 1: 'processing', 2: 'encoding',
    3: 'ready', 4: 'partial', 5: 'failed',
    6: 'upload_started', 7: 'upload_finished', 8: 'upload_failed',
  };

  // Sync to Redis if ready
  if (data.status === VIDEO_READY_STATUS) {
    await redis.set(videoReadyKey(videoGuid), '1', 'EX', 60 * 60 * 24 * 30);
  }

  return {
    status: data.status,
    statusText: statusText[data.status] ?? 'unknown',
    storageSize: data.storageSize,
    availableResolutions: data.availableResolutions,
  };
}

// ── Delete a video from Bunny ─────────────────────────────────────────────────
export async function deleteBunnyVideo(videoGuid: string): Promise<void> {
  const apiKey = requireEnv('BUNNY_STREAM_API_KEY');
  const libraryId = requireEnv('BUNNY_STREAM_LIBRARY_ID');

  await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${videoGuid}`, {
    method: 'DELETE',
    headers: { AccessKey: apiKey },
  });

  await redis.del(videoReadyKey(videoGuid));
  await redis.del(`bunny:failed:${videoGuid}`);
}
