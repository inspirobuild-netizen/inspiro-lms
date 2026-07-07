import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from './authenticate.js';

type Role = JwtPayload['role'];

export function requireRole(roles: Role[]) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.user) {
      reply.status(401).send({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      return;
    }
    if (!roles.includes(req.user.role)) {
      reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
  };
}
