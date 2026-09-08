/**
 * YouTube as a second video source, alongside Bunny Stream.
 *
 * Why both: Bunny gives signed, expiring, enrolment-checked delivery — the
 * right home for paid core lectures. It is also billed per GB, and lecture
 * video is the single largest recurring cost in the product. YouTube's
 * unlisted videos cost nothing to store or deliver, which makes them the
 * right home for content whose leaking would not hurt: demos, orientation,
 * marketing, recorded doubt sessions.
 *
 * The crucial limitation, which the admin UI states in plain words rather
 * than burying: an unlisted video is NOT access-controlled. Anyone holding
 * the link can watch it forever, with no login and no way to revoke. Bunny
 * URLs expire in two hours. So the provider choice is a content-value
 * decision, not merely a cost one.
 *
 * We store only the eleven-character video id. Playback happens through
 * YouTube's official embedded player, which is what their terms require —
 * we never resolve or proxy the underlying media stream.
 */

/** A YouTube id is exactly 11 chars of [A-Za-z0-9_-]. */
const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pulls the video id out of whatever the staff member pasted — a watch URL,
 * a share link, an embed URL, a Shorts link, or the bare id itself.
 *
 * Deliberately strict about the id shape: a near-miss should be rejected at
 * the form rather than saved and discovered as a black screen by a student.
 * Returns null when nothing valid is found.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (ID.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const youtubeHost =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'youtu.be';
  if (!youtubeHost) return null;

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return ID.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get('v');
  if (v && ID.test(v)) return v;

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0]!.toLowerCase())) {
    const id = parts[1]!;
    return ID.test(id) ? id : null;
  }

  return null;
}

/**
 * Confirms the video exists and is embeddable BEFORE it is saved against a
 * lesson, using YouTube's public oEmbed endpoint (no API key, no quota).
 *
 * This catches the three failures that would otherwise surface as a student
 * staring at a blank player: a typo'd id, a fully private video, and — the
 * one people are caught by — a video whose owner has embedding disabled,
 * which plays fine on youtube.com and nowhere else.
 *
 * A network failure is NOT treated as invalid: refusing to save a correct
 * link because oEmbed had a bad minute would be worse than saving it.
 */
export async function verifyYouTubeVideo(
  videoId: string,
): Promise<{ ok: boolean; title?: string; reason?: string }> {
  const endpoint =
    'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);

  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });

    // oEmbed answers 400 — not 404 — for an id that does not resolve, which
    // is easy to miss and would let a typo'd link save happily.
    if (res.status === 400 || res.status === 404) {
      return { ok: false, reason: 'That video does not exist, or it is private. Unlisted is fine; private is not.' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'The owner of that video has disabled embedding, so it cannot play inside the app.' };
    }
    if (!res.ok) return { ok: true };

    const body = (await res.json()) as { title?: string };
    return { ok: true, title: body.title };
  } catch {
    return { ok: true };
  }
}
