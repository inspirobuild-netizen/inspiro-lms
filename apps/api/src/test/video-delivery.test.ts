import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { buildApp } from './helpers.js';
import { redis } from '../lib/redis.js';
import { errorHandler } from '../middleware/error-handler.js';
import {
  playbackOrder,
  rewriteHlsPlaylist,
  signBunnyFolder,
  verifyBunnyFolderToken,
} from '../lib/bunny.js';

const VIDEO = '6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER_VIDEO = '00000000-1111-4222-8333-444444444444';
const CDN = 'vz-test.b-cdn.net';

// The shape Bunny serves (trimmed): relative segment names, no tokens.
const BUNNY_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:4',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXT-X-PLAYLIST-TYPE:VOD',
  '#EXTINF:4.000000,',
  'video0.ts',
  '#EXTINF:4.000000,',
  'video1.ts',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

beforeAll(() => {
  process.env['BUNNY_TOKEN_AUTH_KEY'] = 'test-token-auth-key';
  process.env['BUNNY_CDN_HOSTNAME'] = CDN;
});

describe('playbackOrder', () => {
  it('opens at 480p and keeps the rest best-first', () => {
    expect(playbackOrder(['720p', '480p', '360p', '240p'])).toEqual(['480p', '720p', '360p', '240p']);
  });

  it('opens at the best rendition below 480p when 480p is missing', () => {
    expect(playbackOrder(['720p', '360p', '240p'])).toEqual(['360p', '720p', '240p']);
  });

  it('opens at the smallest rendition when every rendition is taller', () => {
    expect(playbackOrder(['1080p', '720p'])).toEqual(['720p', '1080p']);
  });

  it('honours a different preference and leaves empty lists alone', () => {
    expect(playbackOrder(['1080p', '720p', '480p'], '720p')).toEqual(['720p', '1080p', '480p']);
    expect(playbackOrder([])).toEqual([]);
  });
});

describe('rewriteHlsPlaylist', () => {
  const base = `https://${CDN}/${VIDEO}/480p/`;
  const q = 'token=abc&expires=123';

  it('makes every segment absolute and signed, and leaves tags alone', () => {
    const out = rewriteHlsPlaylist(BUNNY_PLAYLIST, base, q).split('\n');
    expect(out[6]).toBe(`${base}video0.ts?${q}`);
    expect(out[8]).toBe(`${base}video1.ts?${q}`);
    expect(out.filter((l) => l.startsWith('#'))).toEqual(BUNNY_PLAYLIST.split('\n').filter((l) => l.startsWith('#')));
  });

  it('signs URI attributes, appends to an existing query and handles CRLF', () => {
    const src = '#EXTM3U\r\n#EXT-X-MAP:URI="init.mp4"\r\n#EXTINF:4,\r\nseg.m4s?v=2\r\n';
    const out = rewriteHlsPlaylist(src, base, q).split('\n');
    expect(out[1]).toBe(`#EXT-X-MAP:URI="${base}init.mp4?${q}"`);
    expect(out[3]).toBe(`${base}seg.m4s?v=2&${q}`);
  });

  it('never sends the token to another host', () => {
    const src = '#EXTM3U\n#EXTINF:4,\nhttps://ads.example.com/a.ts\n';
    expect(rewriteHlsPlaylist(src, base, q).split('\n')[2]).toBe('https://ads.example.com/a.ts');
  });
});

describe('folder token', () => {
  it('verifies what it signs, for that video only, until it expires', () => {
    const { token, expires } = signBunnyFolder(VIDEO, 600);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyBunnyFolderToken(VIDEO, token, expires)).toBe(true);
    expect(verifyBunnyFolderToken(OTHER_VIDEO, token, expires)).toBe(false);
    expect(verifyBunnyFolderToken(VIDEO, token, expires + 1)).toBe(false);
    expect(verifyBunnyFolderToken(VIDEO, token, expires, expires)).toBe(false);
    expect(verifyBunnyFolderToken(VIDEO, token.slice(1), expires)).toBe(false);
    expect(verifyBunnyFolderToken(VIDEO, token, Number.NaN)).toBe(false);
  });
});

describe('GET /api/v1/stream/:videoId/:rendition/video.m3u8', () => {
  let app: FastifyInstance;
  const url = (vid: string, rendition: string, query: string) =>
    `/api/v1/stream/${vid}/${rendition}/video.m3u8${query}`;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await redis.del(`bunnyhls:${VIDEO}:480p`, `bunnyhls:${VIDEO}:720p`);
  });

  it('rejects a missing or malformed link before touching Bunny', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await app.inject({ method: 'GET', url: url(VIDEO, '480p', '') })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: url('not-a-uuid', '480p', '?token=x&expires=1') })).statusCode).toBe(400);
    const { token, expires } = signBunnyFolder(VIDEO, 600);
    expect((await app.inject({ method: 'GET', url: url(VIDEO, 'best', `?token=${token}&expires=${expires}`) })).statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a token for another video, or an expired one', async () => {
    const other = signBunnyFolder(OTHER_VIDEO, 600);
    const res = await app.inject({ method: 'GET', url: url(VIDEO, '480p', `?token=${other.token}&expires=${other.expires}`) });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('STREAM_LINK_EXPIRED');

    const old = signBunnyFolder(VIDEO, -10);
    expect((await app.inject({ method: 'GET', url: url(VIDEO, '480p', `?token=${old.token}&expires=${old.expires}`) })).statusCode).toBe(403);
  });

  it('serves the signed playlist, fetching Bunny once and caching a finished playlist', async () => {
    const fetchSpy = vi.fn(async () => new Response(BUNNY_PLAYLIST, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { token, expires } = signBunnyFolder(VIDEO, 600);

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: 'GET', url: url(VIDEO, '480p', `?token=${token}&expires=${expires}`) });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.apple.mpegurl');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.body).toContain(`https://${CDN}/${VIDEO}/480p/video0.ts?token=${token}&expires=${expires}`);
      expect(res.body).not.toMatch(/^video\d+\.ts$/m);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // The server signs its own fetch of the exact playlist path.
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`^https://${CDN}/${VIDEO}/480p/video\\.m3u8\\?token=`));
  });

  it('does not cache a playlist the encoder is still writing', async () => {
    const partial = BUNNY_PLAYLIST.replace('#EXT-X-ENDLIST\n', '');
    const fetchSpy = vi.fn(async () => new Response(partial, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const { token, expires } = signBunnyFolder(VIDEO, 600);
    for (let i = 0; i < 2; i++) {
      expect((await app.inject({ method: 'GET', url: url(VIDEO, '720p', `?token=${token}&expires=${expires}`) })).statusCode).toBe(200);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('says not ready for a rendition Bunny does not have, and unavailable when Bunny refuses us', async () => {
    const { token, expires } = signBunnyFolder(VIDEO, 600);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    const missing = await app.inject({ method: 'GET', url: url(VIDEO, '720p', `?token=${token}&expires=${expires}`) });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('VIDEO_NOT_READY');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })));
    const refused = await app.inject({ method: 'GET', url: url(VIDEO, '720p', `?token=${token}&expires=${expires}`) });
    expect(refused.statusCode).toBe(502);
    expect(refused.json().error.code).toBe('VIDEO_UNAVAILABLE');
  });

  it('keeps the playlist token out of the request log', async () => {
    const lines: string[] = [];
    const logged = Fastify({ logger: { level: 'info', stream: { write: (l: string) => { lines.push(l); } } } });
    await logged.register(rateLimit, { global: false, redis });
    logged.setErrorHandler(errorHandler);
    await logged.register(import('../modules/courses/courses.routes.js'), { prefix: '/api/v1' });
    await logged.ready();

    const wrong = signBunnyFolder(OTHER_VIDEO, 600);
    await logged.inject({ method: 'GET', url: url(VIDEO, '480p', `?token=${wrong.token}&expires=${wrong.expires}`) });
    // Control: an ordinary route is logged with its URL, so silence above is the route's doing.
    await logged.inject({ method: 'GET', url: `/api/v1/lessons/${VIDEO}/watch-url?format=hls` });
    await logged.close();

    const log = lines.join('');
    expect(log).toContain('/watch-url?format=hls');
    expect(log).not.toContain(wrong.token);
    expect(log).not.toContain('/stream/');
  });

  it('keeps watch-url behind sign-in', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/lessons/${VIDEO}/watch-url?format=hls` });
    expect(res.statusCode).toBe(401);
  });
});
