import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { AiUnavailableError } from '../../lib/ai-client.js';
import { getMyPlan } from './coach.service.js';

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

const planQuerySchema = z.object({
  language: z.enum(['en', 'ml']).default('en'),
  refresh: z.coerce.boolean().default(false),
});

export default async function coachRoutes(app: FastifyInstance) {
  // Personalized 7-day study plan (cached 24h; ?refresh=true regenerates)
  app.get(
    '/coach/my-plan',
    {
      preHandler: [authenticate],
      config: {
        // Regeneration hits the LLM — keep it tight
        rateLimit: { max: 6, timeWindow: '1 hour', keyGenerator: (req) => `coach:${(req as { user?: { sub: string } }).user?.sub ?? req.ip}` },
      },
    },
    async (req, reply) => {
      const input = validate(planQuerySchema, req.query, reply);
      if (!input) return;
      try {
        const result = await getMyPlan(req.user.sub, input);
        return reply.send({ success: true, data: result });
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          return reply.status(503).send({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'Your coach is offline right now — try again later' } });
        }
        throw err;
      }
    },
  );
}
