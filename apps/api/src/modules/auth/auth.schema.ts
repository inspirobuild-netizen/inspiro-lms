import { z } from 'zod';

export const sendOtpSchema = z.object({
  phone: z
    .string()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number (+91XXXXXXXXXX)'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

// The ID token Firebase hands back after a successful phone verification.
// Only its length is bounded here — authenticity is established by verifying
// the signature against Google's public keys, never by shape.
export const firebasePhoneSchema = z.object({
  idToken: z.string().min(20).max(4096),
});

export const loginSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  // refresh token comes from httpOnly cookie, not body
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  password: z.string().min(8).max(128),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
