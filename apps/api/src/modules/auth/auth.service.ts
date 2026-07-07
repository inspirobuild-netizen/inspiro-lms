import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { redis, OTP_TTL } from '../../lib/redis.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { sendOtp as dispatchSms } from '../../lib/sms.js';
import { users, refreshTokens } from '../../../drizzle/schema.js';

const OTP_RATE_LIMIT_TTL = 60; // 1 resend per minute
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
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

// ── Shared: issue access + refresh pair ──────────────────────────────────────
async function issueTokenPair(user: { id: string; role: 'student' | 'instructor' | 'admin'; name: string; phone: string; avatarUrl: string | null }) {
  const [accessToken, newRefreshToken] = await Promise.all([
    signAccessToken({ sub: user.id, role: user.role }),
    signRefreshToken(user.id),
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
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
  };
}
