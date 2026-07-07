import { SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '../middleware/authenticate.js';

const encoder = new TextEncoder();

function getSecret(key: string): Uint8Array {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return encoder.encode(val);
}

export async function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env['JWT_ACCESS_EXPIRY'] ?? '15m')
    .sign(getSecret('JWT_SECRET'));
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env['JWT_REFRESH_EXPIRY'] ?? '30d')
    .sign(getSecret('JWT_REFRESH_SECRET'));
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, getSecret('JWT_REFRESH_SECRET'));
  if ((payload as { type?: string }).type !== 'refresh') {
    throw new Error('Not a refresh token');
  }
  return { sub: payload.sub as string };
}
