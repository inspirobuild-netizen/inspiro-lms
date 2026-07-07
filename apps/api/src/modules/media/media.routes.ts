import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { createVideoSchema, bunnyWebhookSchema, createPresignedUploadSchema } from './media.schema.js';
import {
  createBunnyVideo,
  handleBunnyWebhook,
  verifyBunnySignature,
  isVideoReady,
  getBunnyVideoStatus,
  deleteBunnyVideo,
} from './media.service.js';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { lessons } from '../../../drizzle/schema.js';
import { logger } from '../../lib/logger.js';

export default async function mediaRoutes(app: FastifyInstance) {
  // ── POST /admin/media/create-video ─────────────────────────────────────────
  // Step 1 of upload flow: admin creates a video slot in Bunny, gets upload URL
  app.post(
    '/admin/media/create-video',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const parsed = createVideoSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
        });
      }

      const result = await createBunnyVideo(parsed.data);

      // Return upload URL and the API key the client uses as the AccessKey header
      // The client PUTs the raw video file directly to Bunny — server is never in the upload path
      return reply.status(201).send({
        success: true,
        data: {
          videoGuid: result.videoGuid,
          lessonId: result.lessonId,
          uploadUrl: result.uploadUrl,
          uploadHeaders: {
            AccessKey: process.env['BUNNY_STREAM_API_KEY'] ?? '',
            'Content-Type': 'application/octet-stream',
          },
          instructions: 'PUT the raw video binary to uploadUrl with the provided headers',
        },
      });
    },
  );

  // ── GET /admin/media/video/:guid/status ────────────────────────────────────
  // Poll transcoding status (admin/instructor use during upload flow)
  app.get(
    '/admin/media/video/:guid/status',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { guid } = req.params as { guid: string };
      const status = await getBunnyVideoStatus(guid);
      return reply.send({ success: true, data: status });
    },
  );

  // ── GET /lessons/:id/video-status ──────────────────────────────────────────
  // Lightweight Redis check — student polls this after starting upload
  app.get(
    '/lessons/:id/video-status',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [lesson] = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);

      if (!lesson) {
        return reply.status(404).send({ success: false, error: { code: 'LESSON_NOT_FOUND', message: 'Lesson not found' } });
      }

      if (!lesson.bunnyVideoId) {
        return reply.send({ success: true, data: { ready: false, reason: 'no_video_attached' } });
      }

      const ready = await isVideoReady(lesson.bunnyVideoId);
      return reply.send({ success: true, data: { ready, videoGuid: lesson.bunnyVideoId } });
    },
  );

  // ── DELETE /admin/media/video/:guid ───────────────────────────────────────
  // Remove video from Bunny and clear lesson reference
  app.delete(
    '/admin/media/video/:guid',
    { preHandler: [authenticate, requireRole(['admin', 'instructor'])] },
    async (req, reply) => {
      const { guid } = req.params as { guid: string };
      await deleteBunnyVideo(guid);

      // Clear the reference on the lesson (if any)
      await db
        .update(lessons)
        .set({ bunnyVideoId: null, bunnyLibraryId: null })
        .where(eq(lessons.bunnyVideoId, guid));

      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  // ══ Webhook — no auth, signature-verified ════════════════════════════════
  // ── POST /webhooks/bunny ───────────────────────────────────────────────────
  app.post('/webhooks/bunny', async (req, reply) => {
    const signature = req.headers['bunny-signature'] as string | undefined;
    const token = (req.query as { token?: string }).token;

    const parsed = bunnyWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn({ body: req.body }, 'Bunny webhook: unrecognised payload shape');
      // Always return 200 to Bunny so it stops retrying
      return reply.send({ received: true });
    }

    const payload = parsed.data;

    if (!verifyBunnySignature(payload, signature, token)) {
      logger.warn({ videoGuid: payload.VideoGuid }, 'Bunny webhook: signature mismatch — ignoring');
      return reply.status(401).send({ received: false });
    }

    // Process async — respond immediately so Bunny doesn't time out
    setImmediate(() => {
      handleBunnyWebhook(payload).catch((err) =>
        logger.error({ err, videoGuid: payload.VideoGuid }, 'Bunny webhook processing error'),
      );
    });

    return reply.send({ received: true });
  });
}
