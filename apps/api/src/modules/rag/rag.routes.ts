import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { AiUnavailableError } from '../../lib/ai-client.js';
import { reindexAll } from './rag.service.js';

export default async function ragRoutes(app: FastifyInstance) {
  // Rebuild the semantic index (run after bulk content changes)
  app.post(
    '/admin/rag/reindex',
    {
      preHandler: [authenticate, requireRole(['admin'])],
      config: { rateLimit: { max: 2, timeWindow: '1 hour' } },
    },
    async (_req, reply) => {
      try {
        const result = await reindexAll();
        return reply.send({ success: true, data: result });
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          return reply.status(503).send({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'Embeddings service is not available' } });
        }
        throw err;
      }
    },
  );
}
