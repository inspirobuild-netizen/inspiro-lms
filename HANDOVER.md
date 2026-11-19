# Handover — state as of 2026-11-19

Snapshot for continuing development on another machine (moving from the
Windows PC to a Mac). Permanent facts live in `CLAUDE.md`; this file is
"where we are right now" — trust the code and the live system over it.

---

## Setting up the new machine

```bash
git clone https://github.com/inspirobuild-netizen/inspiro-lms.git
cd inspiro-lms && pnpm install
```

Copy these across by hand — they are gitignored and **cannot** come from the
clone (they are in the migration folder made on the PC):

| File | Goes to | Purpose |
|---|---|---|
| `.env.production` | repo root | Server env (only for editing/redeploying server config) |
| `apps-api.env` | `apps/api/.env` | Local API dev, `DATABASE_URL` |
| `inspiro-release.jks` | `mobile/android/` | **Android upload key — irreplaceable. Keep a backup.** |
| `key.properties` | `mobile/android/` | Keystore passwords (`storeFile=../inspiro-release.jks`) |
| `google-services.json` | `mobile/android/app/` | Firebase Android config |
| `AuthKey_7369JHNR2C.p8` | anywhere private, e.g. `~/keys/` | App Store Connect API key (status checks, staging builds) |
| `AuthKey_6G835B9KAC.p8` | anywhere private | APNs key (already uploaded to Firebase; keep as backup — shared with Kinvo, never revoke) |

SSH to the server (`root@200.97.162.147`): make a **new** key on the Mac
(`ssh-keygen -t ed25519`) and add its `.pub` to `/root/.ssh/authorized_keys`
on the server, rather than copying the PC's private key.

Tooling: Node 22 + pnpm, Flutter, Android SDK (`adb`), Xcode for iOS work.
iOS release builds run on GitHub Actions (tag `ios-v<version>`), not locally.
On the Mac: prefix local iOS runs with `FLUTTER_SWIFT_PACKAGE_MANAGER=false`
(see Gotchas); the admin dev server is `admin-mac` in `.claude/launch.json`.

Sanity check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.inspiroiasacademy.in/health   # 200
ssh -o BatchMode=yes root@200.97.162.147 hostname
```

---

## Release state

| | Version | State |
|---|---|---|
| Android (Play) | 1.1.4 (2040) | Live |
| Android | 1.1.5 (2050) | Built: `store-assets/Inspiro-v1.1.5-2050.aab` (sha256 ae791c19…), upload is manual in Play Console |
| iOS | 1.1.4 (51) | **Waiting for review** — resubmitted 15 Nov after answering Apple's 2.1(b) business-model questions (in-person coaching, fees at the office, guideline 3.1.3(e)) |
| iOS | 1.1.5 (57) | Built on TestFlight (run 57), simulator sign-in check passed. Stage it only after Apple decides on 1.1.4 — swapping the build loses the queue place |

Apple risk: one-to-many live classes (3.1.3(d)). Fallback if Apple objects:
hide the Live tab on iOS in the next build.

Release notes, rejection history and the reply texts: `docs/STORE_RELEASE_v1.md`.

---

## Deploying the server

`/opt/inspiro` on the server is **not** a clean git checkout (`git pull`
refuses). Deploy by copying changed files:

1. Check the server's copy matches the last committed version
   (`md5sum` of `tr -d '\r' < file` on both sides).
2. `scp` the changed files to the same path under `/opt/inspiro/`.
3. `docker compose -f docker-compose.prod.yml build api`
4. `docker compose -f docker-compose.prod.yml up -d --no-deps api`
5. `curl https://api.inspiroiasacademy.in/health`

The admin panel deploys itself on Vercel when `main` is pushed (~3 min).
Push admin changes only after the API they depend on is live.

Test new server code against production without touching the live API, in a
one-off container from the freshly built image:

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
  -v /root/x.mjs:/app/x.mjs:ro --entrypoint node api --no-warnings /app/x.mjs
```

Ready-made checks in `apps/api/scripts/` (each creates throwaway data and
removes it): `e2e-student-journey.mjs` (33 checks), `e2e-crm-fees.mjs`
(46), `e2e-student-purge.mjs` (6), `check-client-asks.mjs` (6),
`check-video-hls.mjs` (18, read-only: MP4 default, HLS playlist, signed
segments, refused tokens).
Load tests: `k6/load-tests/` (run with the grafana/k6 Docker image on the
server; the leaderboard test needs a fresh 15-minute student token).

---

## What changed in November

- Request-to-enrol flow; **paid courses collect the first payment at
  approval** (full fee or first instalment, never a typed figure).
- Exams: batch picker on create, "Taken by" column, Change batches,
  publishing a non-practice test with no batch refused (`NO_AUDIENCE`),
  Delete.
- Students: App column (device, last active) + "Using the app / Never
  signed in" filter; **permanent delete** (admins, typed confirmation,
  second tick for confirmed payments).
- Fees: free admissions are `paid`; Outstanding lists plan-less balances;
  payment history shows status; CRM conversion = converted / owned leads.
- App 1.1.5: content refresh on course open and tab tap, pull-to-refresh,
  exam result navigation fix, real marks label, Firebase Crashlytics, iOS
  minimum 15.0.
- Groq key renewed 6 Nov (AI service). The academy switched **AI doubt
  answers off** in Settings on 17 Nov — doubts go to mentors by their choice.

## Shipped 19 Nov

API live from commit a44905a (image built and restarted 09:23 UTC). The
admin deploys from `main` on Vercel once these commits are pushed; the Mac's
GitHub logins (uvais-kodix, campuslink-web) cannot push to this repository.
App changes ship with the next release.

- **Classes start faster on mobile data.** Measured on the one Bunny class
  (37 min): an MP4 must download its whole index before the first frame
  (4.4 MB at 720p, 2.3 MB below), and that index grows with the class,
  ~9 MB at 480p for a 2.5-hour lecture. HLS needs a ~96 KB playlist and one
  4-second segment (314 KB at 480p), however long the class.
  - API, live: installed apps take the first quality, which is now **480p**
    instead of 720p (`DEFAULT_RENDITION`, `lib/bunny.ts`). Checked over
    HTTP as review account A.
  - API, live: `GET /api/v1/stream/:videoId/:rendition/video.m3u8?token&expires`
    serves Bunny's rendition playlist with every segment rewritten to an
    absolute CDN URL signed with the folder token (Bunny lists segments by
    relative name, which drops the token). HLS goes only to clients asking
    `watch-url?format=hls`, or to everyone once `VIDEO_FORMAT=hls` is in
    `.env.production`; installed builds hand the URL straight to mpv, so
    that switch moves them without a release. `VIDEO_FORMAT` is not set.
  - App, next release: asks for HLS, and falls back to MP4 on a fresh
    player if HLS fails to start (mpv cannot open it, or no media after
    20 s), staying on MP4 for the rest of the session. Other player errors
    (no audio device, a `tcp:` retry) do not count. The quality menu lists
    best first.
  - Checked: 63 API tests; `scripts/check-video-hls.mjs` 18/18 against
    production data and Bunny on the deployed image;
    `mobile/integration_test/video_playback_test.dart` 8/8 in the iOS
    Simulator (HLS start and seek, resume at 10:00, a 720p switch keeping
    the position, a refused playlist falling back to MP4).
  - Before setting `VIDEO_FORMAT=hls`, play a class over HLS on a real
    Android phone: so far only the iOS Simulator has played it.
- **Secret query values are masked in every log line** (`lib/logger.ts`):
  token, key, secret, signature, sig and password. The first deploy logged a
  test playlist token through the error handler; fixed in 781862c.
- **Analytics CSV exports work.** The buttons were plain links that cannot
  carry the token, so every export returned 401. Reports downloads now also
  refresh an expired token instead of failing.

## Open items

- Domain `inspiroiasacademy.in` (GoDaddy) expires **2027-01-15**, auto-renew off.
- Academy housekeeping: tick batches on old tests, delete the two empty
  "weekly test" exams and test students, check the 600-seat "Batch 1".
- Online fees (HDFC gateway, v2): classroom-course fees may use the gateway
  in the iOS app (3.1.3(e)); online-only courses on iPhone need IAP or
  website-only purchase. Plan: a per-course "classroom / online-only" flag.
- Video: see "Ready to deploy". No adaptive bitrate either way (mpv picks
  one rendition), so the starting quality still matters.
- **iOS scene life cycle: built and verified 19 Nov, not committed yet;
  ships with the next iOS release.** An app built with Xcode 27 does not launch on iOS 27
  without the UIScene life cycle ("UIScene life cycle is required for apps
  built with this SDK"). Store builds were safe meanwhile, since CI's
  `macos-26` runners default to Xcode 26.6, but local runs on the Mac failed.
  Flutter's own scene template registers plugins after launch has finished,
  so firebase_messaging never sets itself up, nothing forwards notifications
  to Firebase Auth, and phone sign-in fails (the 1.1.3 rejection). The shell
  now starts the engine and registers plugins at launch, as before; the scene
  delegate only shows that engine, and hands reCAPTCHA return URLs to
  Firebase Auth. `AppDelegate.swift` explains. Checked on the iOS 27.2
  Simulator with an Xcode 27.2 build: `review_sign_in_test.dart` signs in
  both review numbers; with Flutter's stock template the same test fails
  with "notification-not-forwarded". Before the next iOS release:
  run the CI sign-in e2e (tag `ios-e2e-<n>`), then sign in with a real
  number and receive a push on an iPhone from TestFlight.
- **App Review account B was deleted.** "Guest Aspirant" (+91 7000000002)
  was permanently deleted by an admin on 17 Nov; the 19 Nov sign-in check
  re-created it through sign-up and filled the name back in. Ask the academy
  to leave both App Review accounts alone; the review notes and the CI
  sign-in check depend on them.

## Gotchas worth not relearning

- Inside drizzle `.select()`, `${users.id}` in a raw `sql` subquery renders
  unqualified `"id"` and silently binds to the inner table — use
  `sql.raw('"users"."id"')`.
- Android local build: with the `integration_test` dev dependency, never
  build with `--no-pub` (stale plugin registrant breaks release javac).
- App Store Connect: after a rejection, "Resubmit to App Review" stays grey
  until the version page is saved once (add a space to the review notes).
- Fee amounts are never accepted from the client — always resolved server-side.
- Logs record full URLs. `lib/logger.ts` masks the query values named
  token, key, secret, signature, sig and password, in request logs and in the
  error handler; give any new secret parameter one of those names.
- Integration tests on a local simulator: its on-screen keyboard can cover a
  button, and the tap then lands on nothing (only a warning in the log). Close
  the keyboard before tapping; the uncommitted iOS change makes
  `review_sign_in_test.dart` do so.
- Flutter 3.44 turns Swift Package Manager on by default, and Agora,
  media_kit and flutter_local_notifications break under it. CI runs
  `flutter config --no-enable-swift-package-manager`; locally, prefix the
  command with `FLUTTER_SWIFT_PACKAGE_MANAGER=false` instead of changing the
  machine-wide setting other projects share.
- Any iOS build or `flutter test` rewrites three tracked files with local
  paths and the run's dart-defines: `mobile/ios/Flutter/Generated.xcconfig`,
  `flutter_export_environment.sh`, `ephemeral/flutter_native_integration.env`.
  `git checkout` them before committing.
