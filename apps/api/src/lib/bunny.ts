import crypto from 'crypto';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// Generate a signed Bunny Stream URL that expires after `ttlSeconds`.
// Signed with the library's TOKEN AUTHENTICATION KEY (Stream library →
// Security → Token authentication) — NOT the Stream API key.
export function signBunnyUrl(videoId: string, ttlSeconds = 7200): string {
  const hostname = requireEnv('BUNNY_CDN_HOSTNAME');
  const tokenKey = requireEnv('BUNNY_TOKEN_AUTH_KEY');
  const libraryId = requireEnv('BUNNY_STREAM_LIBRARY_ID');

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const path = `/${libraryId}/${videoId}/playlist.m3u8`;

  // Bunny token auth: SHA256(tokenKey + path + expires)
  const token = crypto
    .createHash('sha256')
    .update(tokenKey + path + expires)
    .digest('hex');

  return `https://${hostname}${path}?token=${token}&expires=${expires}`;
}

// Signed URL for a file on Bunny pull-zone (PDFs, images)
export function signBunnyFileUrl(filePath: string, ttlSeconds = 3600): string {
  const hostname = requireEnv('BUNNY_CDN_HOSTNAME');
  const tokenKey = requireEnv('BUNNY_TOKEN_AUTH_KEY');

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = crypto
    .createHash('sha256')
    .update(tokenKey + filePath + expires)
    .digest('hex');

  return `https://${hostname}${filePath}?token=${token}&expires=${expires}`;
}
