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
//      sub-paths (`480p/video.m3u8`), which point at segments — and Bunny
//      does NOT rewrite the playlist to carry tokens, so each of those is
//      an unsigned request unless the token already covers it. Bunny treats
//      the signed string as a PATH PREFIX, so signing `/{videoId}/` (with
//      the trailing slash) authorises the renditions and every segment
//      beneath it. Signing only playlist.m3u8 authorises the first request
//      and nothing after it — playback would start, then stall.
//      Do NOT send a `token_path` parameter: verified against a live
//      library, adding it makes Bunny reject the request with 403.
export function signBunnyUrl(videoId: string, ttlSeconds = 7200): string {
  const hostname = requireEnv('BUNNY_CDN_HOSTNAME');
  const tokenKey = requireEnv('BUNNY_TOKEN_AUTH_KEY');

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;

  // Sign the video's folder as a prefix, so one token covers the master
  // playlist, every rendition and every segment.
  const token = bunnyToken(tokenKey, `/${videoId}/`, expires);

  return `https://${hostname}/${videoId}/playlist.m3u8?token=${token}&expires=${expires}`;
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

// Signed URL for one MP4 rendition of a Bunny Stream video.
//
// We serve MP4 rather than the HLS playlist because CDN token authentication
// and HLS are structurally incompatible on a native player: the master
// playlist points at RELATIVE sub-paths (`480p/video.m3u8`), Bunny does not
// rewrite them to carry the token, and standard URL resolution drops the
// query string — so the playlist loads and every rendition after it is 403.
// An MP4 is a single request, so one signature covers the whole lesson.
//
// The trade-off is no adaptive bitrate; the player offers the renditions
// manually instead, which is why listMp4Renditions exists.
export function signBunnyMp4Url(videoId: string, resolution: string, ttlSeconds = 7200): string {
  const hostname = requireEnv('BUNNY_CDN_HOSTNAME');
  const tokenKey = requireEnv('BUNNY_TOKEN_AUTH_KEY');

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const path = `/${videoId}/play_${resolution}.mp4`;

  return `https://${hostname}${path}?token=${bunnyToken(tokenKey, path, expires)}&expires=${expires}`;
}

// Highest first, so the caller can take [0] as the default.
const RESOLUTION_ORDER = ['1080p', '720p', '480p', '360p', '240p'];

/** Orders Bunny's comma-separated availableResolutions best-first. */
export function orderResolutions(available: string): string[] {
  const have = new Set(available.split(',').map((r) => r.trim()).filter(Boolean));
  return RESOLUTION_ORDER.filter((r) => have.has(r));
}

// The rendition a class opens at. Most students watch on mobile data, and the
// starting rendition decides both how long the first frame takes and whether
// playback keeps up afterwards. Measured on a 37-minute class (Nov 2026): the
// 720p MP4 carries a 4.4 MB index the player needs before its first frame,
// every lower rendition 2.3 MB, and 720p streams at ~1.4 Mbps against ~0.8 for
// 480p. 480p is legible for a lecture on a phone; 720p stays one tap away.
export const DEFAULT_RENDITION = '480p';

const renditionHeight = (r: string): number => Number.parseInt(r, 10) || 0;

/**
 * Orders renditions for playback: the one a class should open at first, then
 * the rest best-first. Players take [0] as the default — installed app builds
 * do exactly that — so this order is what decides their starting quality.
 *
 * Opens at the best rendition no taller than [preferred], or the smallest one
 * when every rendition is taller (a library set to encode HD only).
 */
export function playbackOrder(bestFirst: string[], preferred = DEFAULT_RENDITION): string[] {
  if (bestFirst.length === 0) return bestFirst;
  const cap = renditionHeight(preferred);
  const pick = bestFirst.find((r) => renditionHeight(r) <= cap) ?? bestFirst[bestFirst.length - 1]!;
  return [pick, ...bestFirst.filter((r) => r !== pick)];
}

// ── HLS through our own rendition playlist ───────────────────────────────────
//
// Why HLS: an MP4's index has an entry for every frame, so it grows with the
// class, and the player needs all of it before the first frame — 2.3 MB for a
// 37-minute class at 480p, ~9 MB for a 2.5-hour one. HLS has no such index: a
// rendition playlist plus one 4-second segment (~300 KB at 480p) is enough to
// start, however long the class.
//
// Why a playlist of our own: Bunny lists segments by RELATIVE name, and URL
// resolution drops the query string that carries the token, so a player that
// fetches Bunny's playlist directly gets 403 on every segment. The API serves
// the rendition playlist instead, each segment rewritten to an absolute Bunny
// URL carrying the folder token. Segments still go straight from Bunny's CDN
// to the student; only the playlist passes through the VPS.

/** Token for a video's whole folder: every rendition playlist and segment beneath it. */
export function signBunnyFolder(videoId: string, ttlSeconds: number): { token: string; expires: number } {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { token: bunnyToken(requireEnv('BUNNY_TOKEN_AUTH_KEY'), `/${videoId}/`, expires), expires };
}

/** True when [token] is the unexpired folder token signBunnyFolder issued for [videoId]. */
export function verifyBunnyFolderToken(
  videoId: string,
  token: string,
  expires: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isSafeInteger(expires) || expires <= nowSeconds) return false;
  const expected = Buffer.from(bunnyToken(requireEnv('BUNNY_TOKEN_AUTH_KEY'), `/${videoId}/`, expires));
  const given = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Folder of one rendition on the CDN, e.g. https://vz-….b-cdn.net/{videoId}/480p/ */
export function bunnyRenditionBase(videoId: string, rendition: string): string {
  return `https://${requireEnv('BUNNY_CDN_HOSTNAME')}/${videoId}/${rendition}/`;
}

/**
 * Rewrites an HLS playlist so every media URI — segment lines and URI="…"
 * attributes — is absolute against [baseUrl] and carries [query]
 * (`token=…&expires=…`). A URI that resolves to another host is left exactly
 * as it was, so the token never travels anywhere but the CDN that issued it.
 */
export function rewriteHlsPlaylist(playlist: string, baseUrl: string, query: string): string {
  const origin = new URL(baseUrl).origin;
  const sign = (uri: string): string => {
    const abs = new URL(uri, baseUrl);
    if (abs.origin !== origin) return uri;
    return `${abs.href}${abs.search ? '&' : '?'}${query}`;
  };
  return playlist
    .split('\n')
    .map((raw) => {
      const line = raw.replace(/\r$/, '');
      if (line.trim() === '') return line;
      if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${sign(uri)}"`);
      return sign(line.trim());
    })
    .join('\n');
}

// Signed URL for a file on Bunny pull-zone (PDFs, images)
export function signBunnyFileUrl(filePath: string, ttlSeconds = 3600): string {
  const hostname = requireEnv('BUNNY_CDN_HOSTNAME');
  const tokenKey = requireEnv('BUNNY_TOKEN_AUTH_KEY');

  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = bunnyToken(tokenKey, filePath, expires);

  return `https://${hostname}${filePath}?token=${token}&expires=${expires}`;
}
