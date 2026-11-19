import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import {
  bunnyRenditionBase,
  rewriteHlsPlaylist,
  signBunnyFileUrl,
  verifyBunnyFolderToken,
} from '../../lib/bunny.js';

// Serves a lesson video's HLS rendition playlists. The reasoning for routing
// playlists through the API lives next to rewriteHlsPlaylist in lib/bunny.ts.

// A finished video-on-demand playlist never changes, so one Bunny fetch serves
// every student; a re-uploaded class gets a new video id and a new cache key.
const PLAYLIST_CACHE_TTL = 60 * 60 * 24 * 7;

function streamError(statusCode: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

async function bunnyRenditionPlaylist(videoId: string, rendition: string): Promise<string> {
  const key = `bunnyhls:${videoId}:${rendition}`;
  const cached = await redis.get(key);
  if (cached) return cached;

  let res: Response;
  try {
    res = await fetch(signBunnyFileUrl(`/${videoId}/${rendition}/video.m3u8`, 300), {
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.warn({ err, videoId, rendition }, 'Bunny playlist fetch failed');
    throw streamError(502, 'VIDEO_UNAVAILABLE', 'The video service did not answer. Please try again.');
  }

  if (res.status === 404) {
    throw streamError(404, 'VIDEO_NOT_READY', 'This video is not ready to stream yet.');
  }
  const text = res.ok ? await res.text() : '';
  if (!text.startsWith('#EXTM3U')) {
    // 401/403 here means our own token key no longer matches the library —
    // worth a loud log, because every student is affected at once.
    logger.error({ videoId, rendition, status: res.status }, 'Bunny refused or garbled a rendition playlist');
    throw streamError(502, 'VIDEO_UNAVAILABLE', 'This video could not be streamed. Please try again.');
  }

  // Only a complete playlist is safe to keep: one still being written by the
  // encoder would pin a truncated class for the whole TTL.
  if (text.includes('#EXT-X-ENDLIST')) await redis.set(key, text, 'EX', PLAYLIST_CACHE_TTL);
  return text;
}

/**
 * The rendition playlist for [videoId], every segment signed with the folder
 * token the caller presented. The token is the authorisation: watch-url only
 * issues one after its enrolment checks, and it already unlocks every segment
 * on Bunny, so serving the playlist to its holder grants nothing new.
 */
export async function getSignedRenditionPlaylist(
  videoId: string,
  rendition: string,
  token: string,
  expires: number,
): Promise<string> {
  if (!verifyBunnyFolderToken(videoId, token, expires)) {
    throw streamError(403, 'STREAM_LINK_EXPIRED', 'This playback link has expired. Please reopen the class.');
  }
  const playlist = await bunnyRenditionPlaylist(videoId, rendition);
  return rewriteHlsPlaylist(playlist, bunnyRenditionBase(videoId, rendition), `token=${token}&expires=${expires}`);
}
