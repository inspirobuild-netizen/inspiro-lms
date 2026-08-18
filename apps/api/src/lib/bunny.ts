import crypto from 'crypto';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// Generate a signed Bunny Stream URL that expires after `ttlSeconds`.
//
// Signed with the library's TOKEN AUTHENTICATION KEY (Stream library →
// Security → Token authentication) — NOT the Stream API key.
//
// Three things here are easy to get wrong, and all three were:
//
//   1. The path is `/{videoId}/…` — the pull zone is dedicated to one
//      library, so the library id does NOT appear in it. Including it
//      returned 404 for every video (verified against a real upload).
//   2. Bunny's token is base64url of the RAW sha256 digest, not hex.
//   3. HLS is not one request. The master playlist points at relative
//      sub-paths (`480p/video.m3u8`), which point at segments. A token
//      covering only playlist.m3u8 authorises the first request and
//      nothing after it, so playback starts and then stalls. Signing the
//      DIRECTORY (`/{videoId}/`) and passing it as `token_path` covers the
//      renditions and every segment under them.
export function signBunnyUrl(videoId: string, ttlSeconds = 7200): string {
  const hostname = requireEnv('BUNNY_CDN_HOSTNAME');
  const tokenKey = requireEnv('BUNNY_TOKEN_AUTH_KEY');

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;

  // Directory token: authorise everything under the video's folder.
  const tokenPath = `/${videoId}/`;
  const token = bunnyToken(tokenKey, tokenPath, expires);

  return (
    `https://${hostname}/${videoId}/playlist.m3u8` +
    `?token=${token}&expires=${expires}&token_path=${encodeURIComponent(tokenPath)}`
  );
}

// Bunny token auth: base64url( sha256_raw( key + path + expires ) ).
function bunnyToken(key: string, path: string, expires: number): string {
  return crypto
    .createHash('sha256')
    .update(key + path + expires)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Signed URL for a file on Bunny pull-zone (PDFs, images)
export function signBunnyFileUrl(filePath: string, ttlSeconds = 3600): string {
  const hostname = requireEnv('BUNNY_CDN_HOSTNAME');
  const tokenKey = requireEnv('BUNNY_TOKEN_AUTH_KEY');

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = bunnyToken(tokenKey, filePath, expires);

  return `https://${hostname}${filePath}?token=${token}&expires=${expires}`;
}
