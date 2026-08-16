import { createRemoteJWKSet, jwtVerify } from 'jose';
import { logger } from './logger.js';

/**
 * Verifies a Firebase Authentication ID token and extracts the verified phone
 * number from it.
 *
 * Firebase is used only to prove the user controls a phone number — SMS
 * delivery is Google's problem, which is what lets us skip the TRAI/DLT
 * template registration that MSG91 requires. Once the number is proven we
 * mint our own access/refresh pair, so nothing downstream changes: phone
 * remains the identity key the CRM and admissions flows join on.
 *
 * We verify the token ourselves against Google's public keys rather than
 * pulling in firebase-admin, which would mean shipping a service-account
 * private key to the server for a job `jose` (already a dependency) does.
 */

// Google's public keys for Secure Token Service tokens. createRemoteJWKSet
// caches and refreshes these, honouring the endpoint's cache headers.
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function authError(message: string, code: string, statusCode = 401) {
  return Object.assign(new Error(message), { statusCode, code });
}

export interface FirebasePhoneIdentity {
  /** Firebase uid — stable per user, kept for audit/debugging only. */
  uid: string;
  /** E.164, e.g. +919876543210. Firebase only issues this once verified. */
  phone: string;
}

export async function verifyFirebasePhoneToken(idToken: string): Promise<FirebasePhoneIdentity> {
  const projectId = process.env['FIREBASE_PROJECT_ID'];
  if (!projectId) {
    logger.error('FIREBASE_PROJECT_ID is not set — phone sign-in cannot be verified');
    throw authError('Phone sign-in is not available right now', 'PHONE_AUTH_NOT_CONFIGURED', 503);
  }

  jwks ??= createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

  let payload: Record<string, unknown>;
  try {
    // jwtVerify enforces signature, exp, iat, iss and aud. Pinning the
    // algorithm matters: without it a token could arrive signed with a
    // different scheme than the one we expect.
    ({ payload } = await jwtVerify(idToken, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    }) as { payload: Record<string, unknown> });
  } catch (err) {
    logger.warn({ err }, 'Firebase ID token rejected');
    throw authError('Phone verification failed. Please try again.', 'INVALID_FIREBASE_TOKEN');
  }

  // The token must have come from a phone sign-in specifically. A Google or
  // email sign-in against the same Firebase project also produces a valid
  // token for this audience — without this check, one of those would be
  // accepted as proof of a phone number it never verified.
  const firebaseClaim = payload['firebase'] as { sign_in_provider?: string } | undefined;
  if (firebaseClaim?.sign_in_provider !== 'phone') {
    throw authError('Phone verification failed. Please try again.', 'NOT_A_PHONE_SIGN_IN');
  }

  const phone = typeof payload['phone_number'] === 'string' ? payload['phone_number'] : '';
  const uid = typeof payload['sub'] === 'string' ? payload['sub'] : '';
  if (!phone || !uid) {
    throw authError('Phone verification failed. Please try again.', 'INVALID_FIREBASE_TOKEN');
  }

  return { uid, phone };
}
