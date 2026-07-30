import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { getMentorWorkload } from './mentors.service.js';

export default async function mentorsRoutes(app: FastifyInstance) {
  app.get('/admin/mentors/workload', { preHandler: [authenticate, requirePermission('mentors.view')] }, async (_req, reply) => {
    return reply.send({ success: true, data: await getMentorWorkload() });
  });
}
