import type { FastifyInstance } from 'fastify';
import {
  sendOtpSchema,
  verifyOtpSchema,
  firebasePhoneSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schema.js';
import {
  initiateSendOtp,
  verifyOtpAndIssueTokens,
  verifyFirebasePhoneAndIssueTokens,
  loginWithPassword,
  rotateRefreshToken,
  requestPasswordReset,
  resetPassword,
  logout,
} from './auth.service.js';

const REFRESH_COOKIE = 'inspiro_refresh';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
};

export default async function authRoutes(app: FastifyInstance) {
  // ── POST /send-otp ──────────────────────────────────────────────────────────
  app.post('/send-otp', {
    config: {
      rateLimit: { max: 10, timeWindow: '1m' },
    },
    schema: {
      body: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid phone number', details: parsed.error.flatten() },
      });
    }

    const result = await initiateSendOtp(parsed.data.phone);
    return reply.send({ success: true, data: { message: 'OTP sent', resendAfter: result.resendAfter } });
  });

  // ── POST /verify-otp ────────────────────────────────────────────────────────
  app.post('/verify-otp', {
    config: {
      rateLimit: { max: 10, timeWindow: '1m' },
    },
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'otp'],
        properties: {
          phone: { type: 'string' },
          otp: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { phone, otp } = parsed.data;
    const tokens = await verifyOtpAndIssueTokens(phone, otp);

    // Refresh token → httpOnly cookie; access token → response body
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, COOKIE_OPTS);

    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        user: tokens.user,
      },
    });
  });

  // ── POST /phone/firebase ────────────────────────────────────────────────────
  // Firebase Authentication handles SMS delivery and code entry on the device;
  // the app sends us the resulting ID token and we exchange it for our own
  // tokens. Same outcome as /verify-otp, without needing DLT-approved SMS
  // templates. /send-otp and /verify-otp stay for existing installs.
  app.post('/phone/firebase', {
    config: {
      rateLimit: { max: 10, timeWindow: '1m' },
    },
    schema: {
      body: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const parsed = firebasePhoneSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const tokens = await verifyFirebasePhoneAndIssueTokens(parsed.data.idToken);

    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, COOKIE_OPTS);

    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        user: tokens.user,
      },
    });
  });

  // ── POST /login (email + password — admin/instructor only) ────────────────
  app.post('/login', {
    config: {
      // Stricter than OTP: passwords are brute-forceable
      rateLimit: { max: 5, timeWindow: '1m' },
    },
  }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const tokens = await loginWithPassword(parsed.data.email, parsed.data.password);

    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, COOKIE_OPTS);

    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        user: tokens.user,
      },
    });
  });

  // ── POST /forgot-password ─────────────────────────────────────────────────
  app.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1m' } },
  }, async (req, reply) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email address' },
      });
    }
    // Never reveal whether the account exists — always the same response.
    await requestPasswordReset(parsed.data.email);
    return reply.send({
      success: true,
      data: { message: 'If an account exists for that email, a reset link has been sent.' },
    });
  });

  // ── POST /reset-password ──────────────────────────────────────────────────
  app.post('/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '1m' } },
  }, async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters', details: parsed.error.flatten() },
      });
    }
    await resetPassword(parsed.data.token, parsed.data.password);
    return reply.send({ success: true, data: { message: 'Password updated. You can now sign in.' } });
  });

  // ── POST /refresh ───────────────────────────────────────────────────────────
  app.post('/refresh', {
    config: {
      rateLimit: { max: 30, timeWindow: '1m' },
    },
  }, async (req, reply) => {
    const oldToken = req.cookies[REFRESH_COOKIE];
    if (!oldToken) {
      return reply.status(401).send({
        success: false,
        error: { code: 'MISSING_REFRESH_TOKEN', message: 'No refresh token provided' },
      });
    }

    const tokens = await rotateRefreshToken(oldToken);

    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, COOKIE_OPTS);

    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        user: tokens.user,
      },
    });
  });

  // ── POST /logout ────────────────────────────────────────────────────────────
  app.post('/logout', async (req, reply) => {
    const authHeader = req.headers.authorization ?? '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const refreshToken = req.cookies[REFRESH_COOKIE];

    if (accessToken) {
      await logout(accessToken, refreshToken);
    }

    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return reply.send({ success: true, data: { message: 'Logged out' } });
  });
}
