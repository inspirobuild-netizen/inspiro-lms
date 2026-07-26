import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import { redis } from '../lib/redis.js';

const encoder = new TextEncoder();

export type JwtPayload = {
  sub: string;
  role: 'student' | 'instructor' | 'admin' | 'staff';
  iat: number;
  exp: number;
};

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ success: false, error: { code: 'MISSING_TOKEN', message: 'Authentication required' } });
    return;
  }

  const token = authHeader.slice(7);

  // Check token blacklist (logout / ban)
  const isBlacklisted = await redis.get(`blacklist:${token}`);
  if (isBlacklisted) {
    reply.status(401).send({ success: false, error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' } });
    return;
  }

  try {
    const secret = encoder.encode(process.env['JWT_SECRET']);
    const { payload } = await jwtVerify(token, secret);
    req.user = payload as unknown as JwtPayload;
  } catch {
    reply.status(401).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
}
