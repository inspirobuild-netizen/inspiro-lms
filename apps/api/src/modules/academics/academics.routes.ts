import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoleOrPermission } from '../../middleware/require-permission.js';
import { getCoordinatorDashboard } from './academics.service.js';

export default async function academicsRoutes(app: FastifyInstance) {
  app.get(
    '/academics/dashboard',
    { preHandler: [authenticate, requireRoleOrPermission(['admin'], 'batches.manage')] },
    async (_req, reply) => {
      return reply.send({ success: true, data: await getCoordinatorDashboard() });
    },
  );
}
