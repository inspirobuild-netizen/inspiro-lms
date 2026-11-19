// Lesson video delivery against production data and Bunny: installed apps get MP4 opening at
// 480p, HLS is served only when asked, every segment in our playlist is signed and plays, and
// tampered or stretched tokens are refused. Read-only apart from the playlist cache keys it
// writes, which it removes again. Uses the first Bunny lesson it finds.
//
// Run in a one-off container from the deployed image (see HANDOVER.md):
//   docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
//     -v /root/check-video-hls.mjs:/app/x.mjs:ro --entrypoint node api --no-warnings /app/x.mjs
//
// With an OUT_DIR mounted (and -e OUT_DIR=/out), it also writes one signed playlist per
// rendition plus a signed 480p MP4 link, for mobile/integration_test/video_playback_test.dart.
import fs from 'node:fs';
import pg from 'pg';
import { getLessonWatchUrl } from './dist/src/modules/courses/courses.service.js';
import { getSignedRenditionPlaylist } from './dist/src/modules/courses/hls.service.js';
import { redis } from './dist/src/lib/redis.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };
const API = 'https://api.inspiroiasacademy.in';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const { rows: [l] } = await c.query(`select id, bunny_video_id vid from lessons where type='video' and video_provider='bunny' and bunny_video_id is not null limit 1`);
const { rows: [admin] } = await c.query(`select id from users where role='admin' and is_active limit 1`);
await c.end();

const mp4 = await getLessonWatchUrl(l.id, admin.id, 'admin');
check('installed apps (no format asked) still get MP4', mp4.format === 'mp4');
check('MP4 opens at 480p, rest best-first', mp4.qualities[0].label === '480p' && mp4.url === mp4.qualities[0].url, mp4.qualities.map((q) => q.label).join(','));
const r0 = await fetch(mp4.url, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(30_000) })
  .then(async (r) => { await r.arrayBuffer(); return r; }, (e) => ({ status: `ERR ${e.cause?.code ?? e.name}` }));
check('480p MP4 link answers', r0.status === 206, `HTTP ${r0.status}`);

const hls = await getLessonWatchUrl(l.id, admin.id, 'admin', { format: 'hls', apiBase: API });
const u = new URL(hls.qualities[0].url);
check('HLS when asked, 6-hour links', hls.format === 'hls' && hls.expiresIn === 21600);
check('HLS link is the API playlist route at 480p', u.origin === API && u.pathname === `/api/v1/stream/${l.vid}/480p/video.m3u8`, u.pathname);
check('asking for HLS without a public base stays on MP4', (await getLessonWatchUrl(l.id, admin.id, 'admin', { format: 'hls' })).format === 'mp4');

const token = u.searchParams.get('token'), expires = Number(u.searchParams.get('expires'));
try {
  let t = performance.now();
  const pl = await getSignedRenditionPlaylist(l.vid, '480p', token, expires);
  const cold = Math.round(performance.now() - t); t = performance.now();
  await getSignedRenditionPlaylist(l.vid, '480p', token, expires);
  const warm = Math.round(performance.now() - t);
  const segs = pl.split('\n').filter((x) => x && !x.startsWith('#'));
  check('every segment absolute, on the CDN, signed', segs.every((s) => s.startsWith(`https://${process.env.BUNNY_CDN_HOSTNAME}/${l.vid}/480p/video`) && s.endsWith(`?token=${token}&expires=${expires}`)), `${segs.length} segments`);
  check('playlist complete (ENDLIST) and cached', pl.includes('#EXT-X-ENDLIST') && (await redis.get(`bunnyhls:${l.vid}:480p`)) !== null, `${(pl.length / 1024).toFixed(0)} KB; first build ${cold} ms, from cache ${warm} ms`);
  // A network failure to the CDN is a failed check, not a crash that skips the clean-up below.
  const download = async (u) => {
    try { const res = await fetch(u, { signal: AbortSignal.timeout(30_000) }); return { status: res.status, bytes: (await res.arrayBuffer()).byteLength }; }
    catch (e) { return { status: `ERR ${e.cause?.code ?? e.name}`, bytes: 0 }; }
  };
  for (const [name, s] of [['first', segs[0]], ['middle', segs[Math.floor(segs.length / 2)]], ['last', segs.at(-1)]]) {
    t = performance.now(); const r = await download(s);
    check(`${name} segment downloads`, r.status === 200 && r.bytes > 1000, `HTTP ${r.status}, ${(r.bytes / 1024).toFixed(0)} KB in ${Math.round(performance.now() - t)} ms`);
  }
  const naked = await download(segs[0].split('?')[0]);
  check('a segment without the token is still refused by Bunny', naked.status === 403, `HTTP ${naked.status}`);
  const tampered = token[0] === 'A' ? 'B' + token.slice(1) : 'A' + token.slice(1);
  check('a tampered token is refused', (await getSignedRenditionPlaylist(l.vid, '480p', tampered, expires).then(() => 'served', (e) => e.code)) === 'STREAM_LINK_EXPIRED');
  check('a token moved to a later expiry is refused', (await getSignedRenditionPlaylist(l.vid, '480p', token, expires + 3600).then(() => 'served', (e) => e.code)) === 'STREAM_LINK_EXPIRED');
  for (const q of hls.qualities) {
    const qu = new URL(q.url);
    const p = await getSignedRenditionPlaylist(l.vid, q.label, qu.searchParams.get('token'), Number(qu.searchParams.get('expires')));
    check(`${q.label} playlist served`, p.startsWith('#EXTM3U') && p.includes(`/${q.label}/video0.ts?token=`));
    if (process.env.OUT_DIR) fs.writeFileSync(`${process.env.OUT_DIR}/${q.label}.m3u8`, p);
  }
  if (process.env.OUT_DIR) fs.writeFileSync(`${process.env.OUT_DIR}/mp4-480p.txt`, mp4.qualities[0].url);
} catch (e) {
  check('the checks ran to the end', false, e.message);
} finally {
  for (const q of hls.qualities) await redis.del(`bunnyhls:${l.vid}:${q.label}`);
  await redis.quit();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
