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
segments, refused tokens), `check-one-attempt.mjs` (11), `check-staff-roles.mjs`
(18: several roles, mentor-only instructors, staff delete),
`check-ai-limit.mjs` (9: daily AI limit, current-affairs status; one real AI
call unless `--no-ai`).

The AI service deploys the same way: copy the changed files under
`apps/ai/`, then `build ai` and `up -d --no-deps ai`. Its tests run locally
in a venv (`pip install -r apps/ai/requirements-dev.txt`, `pytest`,
`ruff check app tests`).

To try new API code against production without building an image: `pnpm
build` locally (the output is byte-identical to the image's for unchanged
files), copy only the changed `dist/` files to the server, and mount each
over `/app/dist/...` in the one-off container with `-v file.js:/app/dist/src/...:ro`.
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

## Shipped 20 Nov: one attempt per exam

API live from commit 644a8dc (restarted 05:52 UTC). Class 1 Weekly Test
allowed 10 attempts, and four students had submitted it two to four times;
the leaderboard averaged every attempt, so one student's 0, 67, 0, 0 counted
as 16.7%.

- Every exam except practice now allows one submitted attempt, whatever
  "max attempts" says (`attemptLimit`, exams.service.ts). An unfinished
  attempt can be resumed (it used to be refused); one left open from before
  cannot become a retake; submit re-checks. Practice tests keep their limit.
- The leaderboard counts only each student's first submitted attempt at an
  exam. The weekly test was set to one attempt and every batch recomputed.
- Admin shows "max attempts" only for practice tests (needs the push to reach
  Vercel). The app's next release shows "View result" for a submitted test
  and "Resume" for an unfinished one; installed builds already turn the
  server's refusal into "already attempted".
- Check: `scripts/check-one-attempt.mjs`, 11 against production.

## Shipped 20 Nov: staff roles, AI answers, current affairs

API live from commit 1d27177 (restarted 08:32 UTC); AI service rebuilt and
restarted 08:21 UTC. **The admin screens for all of this reach Vercel only
when `main` is pushed.**

- **Several roles per staff member.** `staff_member_roles` links a person to
  every role they hold; permissions are the union. `users.staff_role_id`
  remains the main role (the first chosen). The staff API takes
  `staffRoleIds`; a lone `staffRoleId` from an older screen still works and,
  when it is just the main role re-sent, leaves the other roles alone.
- **Batch instructors are Mentor-role staff.** `assignInstructor` refuses
  anyone else (`NOT_A_MENTOR`); the picker reads
  `GET /admin/batches/instructor-options`. One mentor, any number of batches.
- **Permanent staff delete** (admins only, typed DELETE, never yourself):
  `staff-purge.service.ts` says what happens to each kind of record. Refused
  while they have a live class still to teach.
- **Current affairs had stopped on 17 Nov** (nothing on the 18th, 19th or
  20th). The feeds, Groq key and scheduler all test fine and the old
  containers' logs are gone, so the cause is not established; the likeliest
  is the 6 AM job's first query timing out against a cold database
  (`idleTimeoutMillis` 30 s, `connectionTimeoutMillis` 5 s in `lib/db.ts`).
  Caught up by hand (30 articles on the 20th). The job now checks every hour
  from 6 AM to 10 PM IST, retries its first query, and records what it did:
  Redis `ca:lastCheck` (every hourly check) and `ca:lastRun` (each run, with
  the error if it failed), both shown on the admin Content page. **If the
  feed is stale again, read those two keys first.**
- **AI doubt answers were out of date.** The model has no clock and
  knowledge to mid-2024. Now: the prompt states the date and the knowledge
  limit; each doubt gets the three closest current-affairs items with their
  dates; an answer resting on changeable facts with no dated news behind it
  is capped at 50% confidence, which sends it to a mentor to confirm
  (`apps/ai/app/routers/doubts.py`). Doubts run on `qwen/qwen3.8-27b`
  (`GROQ_DOUBT_MODEL` in docker-compose.prod.yml, knowledge to early 2025),
  falling back to `GROQ_MODEL`.
- **Daily AI answer limit**: `aiDoubtsDailyLimit` (default 5, set on the
  admin Doubts page). Past it a doubt is not refused; it goes to a mentor.
  `/settings/public` reports what is left for the calling student.
- Schema changes are applied by hand from `apps/api/drizzle/manual/` (see
  Gotchas).

## Open items

- **OTP sign-in is down for real phone numbers (found 19 Nov).** The Firebase
  project `inspiro-b394e` is back on the free Spark plan, so Firebase refuses
  to send SMS (`BILLING_NOT_ENABLED`); the App Review test numbers still
  work, which is why every automated check passes. The billing account "My
  Billing Account" belongs to `inspiro.build@gmail.com`: reactivate it at
  console.cloud.google.com/billing, or upgrade to Blaze from the Firebase
  console as `bizence.role@gmail.com`. Probe: `accounts:sendVerificationCode`
  with the Android API key for a real number should answer
  `MISSING_CLIENT_IDENTIFIER`, not `BILLING_NOT_ENABLED`.
- **Pushing to GitHub from the Mac** needs the `inspirobuild-netizen` token
  (the Mac's own logins cannot push), pasted into a helper script because
  the terminal's paste markers break git's password prompt. Giving
  `uvais-kodix` write access to the repository would remove the need.
- **Groq is on the free tier**: 8,000 tokens a minute and 1,000 requests a
  day per model. That is roughly two or three AI doubts a minute. Enough for
  today's use (three doubts in sixteen days); move to the Dev tier before
  many students use AI doubts. Live web search for doubts would also need it.
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
- `drizzle-kit generate` is not usable: its snapshots stop at migration
  0011 while the schema has moved on by hand, so it emits a migration full
  of already-applied changes that would fail on production. Write the new
  SQL by hand, idempotent, in `apps/api/drizzle/manual/`, and apply it with
  a one-off container before deploying code that needs it.
- A check script that submits an exam as a throwaway student recomputes that
  batch's leaderboard with the student in it; recompute again afterwards.
- Installed app builds show "Could not send your doubt. Check your
  connection." for any refusal of a doubt except HTTP 429 ("Too many doubts
  this hour"). To limit something on doubts, route the doubt elsewhere
  instead of refusing it.
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
