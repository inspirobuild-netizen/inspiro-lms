import type { FastifyRequest } from 'fastify';
import { db } from './db.js';
import { auditLogs } from '../../drizzle/schema.js';
import { logger } from './logger.js';

export interface AuditEntry {
  action: string; // e.g. 'staff.created', 'staff.password_reset', 'lead.converted'
  entityType: string; // e.g. 'staff', 'lead', 'student'
  entityId?: string | null;
  actorUserId?: string | null; // defaults to req.user.sub
  meta?: Record<string, unknown>;
}

// Fire-and-forget audit write. Never throws into the request path — a failed
// audit insert must not break the action being audited.
export async function logAudit(req: FastifyRequest, entry: AuditEntry): Promise<void> {
  try {
    const actor = entry.actorUserId ?? req.user?.sub ?? null;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;
    await db.insert(auditLogs).values({
      actorUserId: actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ipAddress: ip,
      meta: entry.meta,
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'audit log write failed');
  }
}
