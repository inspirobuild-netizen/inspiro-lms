import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { redis, OTP_TTL } from '../../lib/redis.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { sendOtp as dispatchSms } from '../../lib/sms.js';
import { verifyPassword, hashPassword } from '../../lib/password.js';
import { sendEmail, passwordResetEmail } from '../../lib/mailer.js';
import { getRolePermissions } from '../../lib/permissions.js';
import { users, refreshTokens, staffRoles } from '../../../drizzle/schema.js';

const OTP_RATE_LIMIT_TTL = 60; // 1 resend per minute
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;

// ── Account lockout (per-email, layered on top of the IP rate limit) ──────────
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_TTL = 15 * 60; // seconds

async function assertNotLocked(email: string): Promise<void> {
  if (await redis.get(`lockuntil:${email}`)) {
    throw Object.assign(new Error('Too many failed attempts. Try again in a few minutes.'), {
      statusCode: 423,
      code: 'ACCOUNT_LOCKED',
    });
  }
}

async function recordLoginFail(email: string): Promise<void> {
  const key = `loginfail:${email}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, LOGIN_LOCK_TTL);
  if (n >= LOGIN_MAX_FAILS) await redis.set(`lockuntil:${email}`, '1', 'EX', LOGIN_LOCK_TTL);
}

async function clearLoginFails(email: string): Promise<void> {
  await redis.del(`loginfail:${email}`, `lockuntil:${email}`);
}
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function generateOtp(): string {
  return Math.floor(100_000 + Math.random() * 900_000).toString();
}

function otpKey(phone: string): string {
  return `otp:${phone}`;
}

function otpRateLimitKey(phone: string): string {
  return `otp_rate:${phone}`;
}

// ── Send OTP ──────────────────────────────────────────────────────────────────
export async function initiateSendOtp(phone: string): Promise<{ resendAfter: number }> {
  const rateLimitKey = otpRateLimitKey(phone);
  const limited = await redis.get(rateLimitKey);
  if (limited) {
    const ttl = await redis.ttl(rateLimitKey);
    throw Object.assign(new Error('Please wait before requesting another OTP'), {
      statusCode: 429,
      code: 'OTP_RATE_LIMITED',
      retryAfter: ttl,
    });
  }

  const otp = generateOtp();
  const pipeline = redis.pipeline();
  pipeline.set(otpKey(phone), otp, 'EX', OTP_TTL);
  pipeline.set(rateLimitKey, '1', 'EX', OTP_RATE_LIMIT_TTL);
  await pipeline.exec();

  await dispatchSms(phone, otp);

  return { resendAfter: OTP_RATE_LIMIT_TTL };
}

// ── Verify OTP & issue tokens ─────────────────────────────────────────────────
export async function verifyOtpAndIssueTokens(phone: string, otp: string) {
  const stored = await redis.get(otpKey(phone));

  if (!stored || stored !== otp) {
    throw Object.assign(new Error('Invalid or expired OTP'), {
      statusCode: 401,
      code: 'INVALID_OTP',
    });
  }

  // Invalidate OTP immediately (single-use)
  await redis.del(otpKey(phone));

  // Upsert user — create on first login
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({ phone, name: 'New User', role: 'student' })
      .returning();
  }

  if (!user!.isActive) {
    throw Object.assign(new Error('Your account has been suspended'), {
      statusCode: 403,
      code: 'ACCOUNT_SUSPENDED',
    });
  }

  return issueTokenPair(user!);
}

// ── Email + password login ────────────────────────────────────────────────────
// Primarily for admin/instructor. Also allows students who have an explicit
// password set (e.g. test accounts) — students without one still use OTP,
// since loginWithPassword requires a non-null passwordHash below.
export async function loginWithPassword(email: string, password: string) {
  // One generic error for every failure mode — never reveal which check failed
  const invalid = () =>
    Object.assign(new Error('Invalid email or password'), {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });

  await assertNotLocked(email);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const ok = !!user && !!user.passwordHash && (await verifyPassword(password, user.passwordHash));
  if (!ok) {
    await recordLoginFail(email);
    throw invalid();
  }

  if (!user!.isActive) {
    throw Object.assign(new Error('Your account has been suspended'), {
      statusCode: 403,
      code: 'ACCOUNT_SUSPENDED',
    });
  }

  await clearLoginFails(email);

  return issueTokenPair(user!);
}

// ── Request a password reset ─────────────────────────────────────────────────
// Always resolves without revealing whether the email exists. Only admin/
// instructor accounts (the ones that use password login) get a reset link.
const RESET_TTL = 30 * 60; // 30 minutes
const RESET_RATE_TTL = 60; // 1 request per minute per account

function resetTokenKey(token: string): string {
  return `pwreset:${token}`;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || (user.role !== 'admin' && user.role !== 'instructor' && user.role !== 'staff') || !user.isActive) {
    return; // silent — never disclose account existence
  }

  // Per-account throttle so the endpoint can't be used to spam an inbox
  const rateKey = `pwreset_rate:${user.id}`;
  if (await redis.get(rateKey)) return;
  await redis.set(rateKey, '1', 'EX', RESET_RATE_TTL);

  const token = randomBytes(32).toString('hex');
  await redis.set(resetTokenKey(token), user.id, 'EX', RESET_TTL);

  const adminBase = process.env['ADMIN_BASE_URL'] ?? 'https://admin.inspiroiasacademy.in';
  const resetUrl = `${adminBase}/reset-password?token=${token}`;
  const { subject, html } = passwordResetEmail(user.name, resetUrl);
  await sendEmail({ to: email, subject, html });
}

// ── Reset password using a token ─────────────────────────────────────────────
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const key = resetTokenKey(token);
  const userId = await redis.get(key);
  if (!userId) {
    throw Object.assign(new Error('This reset link is invalid or has expired'), {
      statusCode: 400,
      code: 'INVALID_RESET_TOKEN',
    });
  }

  const hash = await hashPassword(newPassword);
  const [updated] = await db
    .update(users)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw Object.assign(new Error('Account not found'), { statusCode: 404, code: 'USER_NOT_FOUND' });
  }

  // Single-use token, and sign out every existing session for safety.
  await redis.del(key);
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
}

// ── Refresh access token ──────────────────────────────────────────────────────
export async function rotateRefreshToken(oldToken: string) {
  // Verify the refresh token signature
  const { sub: userId } = await verifyRefreshToken(oldToken).catch(() => {
    throw Object.assign(new Error('Invalid refresh token'), {
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  // Confirm it exists in DB (rotation check — each token is single-use)
  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, oldToken))
    .limit(1);

  if (!stored) {
    // Token reuse detected — possible theft. Invalidate ALL tokens for this user.
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    throw Object.assign(new Error('Refresh token reuse detected'), {
      statusCode: 401,
      code: 'TOKEN_REUSE',
    });
  }

  // Delete the consumed token
  await db.delete(refreshTokens).where(eq(refreshTokens.token, oldToken));

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) {
    throw Object.assign(new Error('User not found or suspended'), {
      statusCode: 401,
      code: 'INVALID_USER',
    });
  }

  return issueTokenPair(user);
}

// ── Logout (blacklist access token + delete refresh) ─────────────────────────
export async function logout(accessToken: string, refreshToken?: string): Promise<void> {
  // Blacklist the access token for its remaining TTL
  await redis.set(`blacklist:${accessToken}`, '1', 'EX', ACCESS_TOKEN_EXPIRY_MS / 1000);

  if (refreshToken) {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
  }
}

// Resolve the effective permission set + staff-role label for a user. Admins
// implicitly hold every permission ('*'); staff get their role's granted set.
async function permissionPayload(user: {
  id: string;
  role: string;
  staffRoleId?: string | null;
}): Promise<{ permissions: string[]; staffRole: { id: string; name: string; slug: string } | null }> {
  if (user.role === 'admin') return { permissions: ['*'], staffRole: null };
  if (user.role === 'staff' && user.staffRoleId) {
    const [permissions, [role]] = await Promise.all([
      getRolePermissions(user.staffRoleId),
      db.select({ id: staffRoles.id, name: staffRoles.name, slug: staffRoles.slug }).from(staffRoles).where(eq(staffRoles.id, user.staffRoleId)).limit(1),
    ]);
    return { permissions, staffRole: role ?? null };
  }
  return { permissions: [], staffRole: null };
}

// ── Shared: issue access + refresh pair ──────────────────────────────────────
async function issueTokenPair(user: {
  id: string;
  role: 'student' | 'instructor' | 'admin' | 'staff';
  name: string;
  phone: string;
  avatarUrl: string | null;
  email?: string | null;
  staffRoleId?: string | null;
}) {
  const [accessToken, newRefreshToken, perms, mustReset] = await Promise.all([
    signAccessToken({ sub: user.id, role: user.role }),
    signRefreshToken(user.id),
    permissionPayload(user),
    redis.get(`forcereset:${user.id}`),
  ]);

  // Persist refresh token
  await db.insert(refreshTokens).values({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email ?? null,
      role: user.role,
      avatarUrl: user.avatarUrl,
      permissions: perms.permissions,
      staffRole: perms.staffRole,
      mustChangePassword: mustReset === '1',
    },
  };
}
