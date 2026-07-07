import { eq, and, isNull, desc, count, inArray } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { deviceTokens, notifications, users } from '../../../drizzle/schema.js';
import { logger } from '../../lib/logger.js';

const FCM_ENDPOINT = 'https://fcm.googleapis.com/v1/projects/{PROJECT_ID}/messages:send';
const FCM_PROJECT_ID = process.env['FCM_PROJECT_ID'] ?? '';
const FCM_SERVICE_ACCOUNT_KEY = process.env['FCM_SERVICE_ACCOUNT_JSON'] ?? '';

// ── FCM HTTP v1 token (service-account OAuth2) ────────────────────────────────
// We use a minimal implementation: cache the access token in memory.
let _accessToken: string | null = null;
let _accessTokenExpiry = 0;

async function getFcmAccessToken(): Promise<string> {
  if (_accessToken && Date.now() < _accessTokenExpiry) return _accessToken;

  if (!FCM_SERVICE_ACCOUNT_KEY) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON env var not set');
  }

  const sa = JSON.parse(FCM_SERVICE_ACCOUNT_KEY) as {
    client_email: string;
    private_key: string;
  };

  // Build JWT for Google OAuth2
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');

  const { createSign } = await import('node:crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const json = (await res.json()) as { access_token: string; expires_in: number };
  _accessToken = json.access_token;
  _accessTokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return _accessToken;
}

// ── Send FCM message to a single token ───────────────────────────────────────
async function sendFcmMessage(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  try {
    const accessToken = await getFcmAccessToken();
    const url = FCM_ENDPOINT.replace('{PROJECT_ID}', FCM_PROJECT_ID);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          ...(data ? { data } : {}),
          android: { priority: 'high' },
          apns: { headers: { 'apns-priority': '10' } },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.warn({ fcmToken: fcmToken.slice(0, 20), err }, 'FCM send failed');
      return false;
    }
    return true;
  } catch (e) {
    logger.error({ err: e }, 'FCM send error');
    return false;
  }
}

// ── Register / update device token ───────────────────────────────────────────
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: string,
) {
  await db
    .insert(deviceTokens)
    .values({ userId, token, platform })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId, platform, updatedAt: new Date() },
    });
  return { registered: true };
}

export async function unregisterDeviceToken(token: string) {
  await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
  return { unregistered: true };
}

// ── Send push + persist notification record ───────────────────────────────────
export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  type: 'class_reminder' | 'exam_alert' | 'result' | 'announcement' | 'doubt_reply' | 'achievement',
  data?: Record<string, unknown>,
) {
  // Persist in DB (userId null = broadcast — here always targeted)
  await db.insert(notifications).values({ userId, title, body, type, data });

  // Fan-out to all registered devices
  const tokens = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));

  const stringData = data
    ? Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      )
    : undefined;

  await Promise.allSettled(
    tokens.map((t) => sendFcmMessage(t.token, title, body, stringData)),
  );
}

// ── Broadcast to all users in a batch ────────────────────────────────────────
export async function broadcastToBatch(
  batchId: string,
  title: string,
  body: string,
  type: 'class_reminder' | 'exam_alert' | 'result' | 'announcement' | 'doubt_reply' | 'achievement',
  data?: Record<string, unknown>,
) {
  // Get all enrolled student IDs
  const { batchEnrollments } = await import('../../../drizzle/schema.js');
  const enrolled = await db
    .select({ userId: batchEnrollments.userId })
    .from(batchEnrollments)
    .where(
      and(
        eq(batchEnrollments.batchId, batchId),
        eq(batchEnrollments.status, 'active'),
      ),
    );

  if (enrolled.length === 0) return { sent: 0 };

  const userIds = enrolled.map((e) => e.userId);

  // Bulk insert notifications
  await db.insert(notifications).values(
    userIds.map((userId) => ({ userId, title, body, type, data })),
  );

  // Fan-out push
  const tokens = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(inArray(deviceTokens.userId, userIds));

  const stringData = data
    ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
    : undefined;

  const results = await Promise.allSettled(
    tokens.map((t) => sendFcmMessage(t.token, title, body, stringData)),
  );

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  logger.info({ batchId, total: tokens.length, sent }, 'Batch broadcast done');
  return { sent, total: tokens.length };
}

// ── List notifications for current user ───────────────────────────────────────
export async function listNotifications(userId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: count() })
    .from(notifications)
    .where(eq(notifications.userId, userId));

  const items = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  return { items, total };
}

export async function markNotificationRead(notificationId: string, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
  return { ok: true };
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { ok: true };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return total;
}
