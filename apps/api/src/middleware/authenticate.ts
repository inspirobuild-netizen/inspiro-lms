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

  let payload: JwtPayload;
  try {
    const secret = encoder.encode(process.env['JWT_SECRET']);
    payload = (await jwtVerify(token, secret)).payload as unknown as JwtPayload;
  } catch {
    reply.status(401).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
    return;
  }

  // Per-user revocation: set when an account is deleted or disabled, for as
  // long as an access token can live. Covers every device at once, which the
  // per-token blacklist above cannot — the server never sees the other
  // devices' tokens until they are used.
  if (await redis.get(`revoked:user:${payload.sub}`)) {
    reply.status(401).send({ success: false, error: { code: 'ACCOUNT_REVOKED', message: 'This account is no longer active' } });
    return;
  }

  req.user = payload;
}

/** Marks every live access token for a user as dead, for the token lifetime. */
export async function revokeUserSessions(userId: string): Promise<void> {
  // Mirrors JWT_ACCESS_EXPIRY (default 15m) with a margin; after that no
  // token minted before the revocation can still be unexpired.
  await redis.set(`revoked:user:${userId}`, '1', 'EX', 20 * 60);
}
