import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import {
  getBatchLeaderboard,
  getGlobalLeaderboard,
  getUserStreak,
  recomputeLeaderboard,
} from './leaderboard.service.js';

type ZodSchema<T> = {
  safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } };
};
function validate<T>(schema: ZodSchema<T>, value: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    void reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() } });
    return null;
  }
  return r.data;
}

const leaderboardQuerySchema = z.object({
  batchId: z.string().uuid().optional(),
  period: z.enum(['weekly', 'monthly', 'all_time']).default('weekly'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export default async function leaderboardRoutes(app: FastifyInstance) {
  // Global or batch leaderboard
  app.get('/leaderboard', { preHandler: [authenticate] }, async (req, reply) => {
    const input = validate(leaderboardQuerySchema, req.query, reply);
    if (!input) return;

    if (input.batchId) {
      const result = await getBatchLeaderboard(
        input.batchId,
        input.period,
        input.page,
        input.limit,
        req.user.sub,
      );
      return reply.send({
        success: true,
        data: result.items,
        meta: {
          page: input.page,
          limit: input.limit,
          total: result.total,
          myRank: result.myRank,
          myScore: result.myScore,
        },
      });
    }

    const result = await getGlobalLeaderboard(input.page, input.limit, req.user.sub);
    return reply.send({
      success: true,
      data: result.items,
      meta: {
        page: input.page,
        limit: input.limit,
        total: result.total,
        myRank: result.myRank,
        myScore: result.myScore,
      },
    });
  });

  // User's own streak
  app.get('/leaderboard/my-streak', { preHandler: [authenticate] }, async (req, reply) => {
    const streak = await getUserStreak(req.user.sub);
    return reply.send({ success: true, data: streak });
  });

  // Admin: trigger recompute for a batch+period
  app.post(
    '/admin/leaderboard/recompute',
    { preHandler: [authenticate, requireRole(['admin'])] },
    async (req, reply) => {
      const input = validate(
        z.object({
          batchId: z.string().uuid(),
          period: z.enum(['weekly', 'monthly', 'all_time']),
        }),
        req.body,
        reply,
      );
      if (!input) return;
      await recomputeLeaderboard(input.batchId, input.period);
      return reply.send({ success: true, data: { recomputed: true } });
    },
  );
}
