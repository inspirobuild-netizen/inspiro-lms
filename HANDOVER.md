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
(46), `e2e-student-purge.mjs` (6), `check-client-asks.mjs` (6).
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

## Open items

- Domain `inspiroiasacademy.in` (GoDaddy) expires **2027-01-15**, auto-renew off.
- Academy housekeeping: tick batches on old tests, delete the two empty
  "weekly test" exams and test students, check the 600-seat "Batch 1".
- Online fees (HDFC gateway, v2): classroom-course fees may use the gateway
  in the iOS app (3.1.3(e)); online-only courses on iPhone need IAP or
  website-only purchase. Plan: a per-course "classroom / online-only" flag.
- Video start is slow on mobile data (720p MP4 default) — consider a lower
  default quality.

## Gotchas worth not relearning

- Inside drizzle `.select()`, `${users.id}` in a raw `sql` subquery renders
  unqualified `"id"` and silently binds to the inner table — use
  `sql.raw('"users"."id"')`.
- Android local build: with the `integration_test` dev dependency, never
  build with `--no-pub` (stale plugin registrant breaks release javac).
- App Store Connect: after a rejection, "Resubmit to App Review" stays grey
  until the version page is saved once (add a space to the review notes).
- Fee amounts are never accepted from the client — always resolved server-side.
