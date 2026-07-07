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

export const refreshSchema = z.object({
  // refresh token comes from httpOnly cookie, not body
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
