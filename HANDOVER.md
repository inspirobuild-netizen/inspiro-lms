# Handover — state as of 2026-08-10

Snapshot for picking this up on another machine. Permanent facts (server,
deploy workflow, conventions) live in `CLAUDE.md`; this file is "where we are
right now" and will go stale — trust the code and the live system over it.

Last commit on `main`: **77d7928**. Working tree was clean at handover.

---

## Setting up a second machine

```bash
git clone https://github.com/inspirobuild-netizen/inspiro-lms.git
cd inspiro-lms && pnpm install
```

Then copy these across by hand — they are gitignored and **cannot** come from
the clone:

| File | Purpose |
|---|---|
| `.env.production` (repo root) | Server env; only needed if you edit/redeploy server config |
| `apps/api/.env` | Local API dev + `pnpm db:migrate:http` (contains `DATABASE_URL`) |
| `~/.ssh/id_ed25519` (+ `.pub`) | SSH to the VPS for deploys |

Tooling needed: Node 20+ with pnpm, Flutter (for `mobile/`), Android SDK +
`adb` if you want to run on a device. Docker is **not** needed locally — builds
happen on the server.

Sanity check once set up:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.inspiroiasacademy.in/health   # 200
ssh -o BatchMode=yes root@200.97.162.147 'hostname'                                # srv1811142
```

### Known friction

- **GitHub push is flaky.** The Windows credential manager sometimes resolves a
  different GitHub account (`bizencerole-coder`), giving a 403 "denied", and
  sometimes hangs trying to open a prompt it cannot display. Retrying usually
  works. A permanent fix is deleting the stale `git:https://github.com` entry in
  Windows Credential Manager, or adding an SSH key to the account and switching
  the remote (the current key is **not** registered with GitHub —
  `ssh -T git@github.com` returns `Permission denied`).
- Deploys go to **200.97.162.147**. See the warning in `CLAUDE.md` about the
  decommissioned box.

---

## What is deployed right now

Everything below is live and was verified against production, not just built.

**Course → batch → enrolment.** Course is the master; `batches.courseId` is NOT
NULL. Three enrolment paths all write `batch_enrollments` + `admissions` with
`courseId` taken from the batch and the fee resolved server-side:

1. Counsellor — Admissions → Leads → Convert (payment required)
2. App self-signup — Fees page → Enrollment requests → Verify (staff confirms UPI)
3. Manual — Batches → *batch* → Enroll student

Path 3 previously wrote only the enrolment row, giving course access with no
admission and no fee due. It now creates both; re-enrolling will not mint a
duplicate admission. Verified live (ADM-00014, ₹10,000 due, `pending`), then
the test data was removed.

Course detail pages now list their batches and can create one scoped to the
course.

**Current affairs.** `CA_RSS_FEEDS` is set on the server to The Hindu's
opinion / business / sci-tech feeds. Ingestion runs daily at **06:00 IST**.

- PIB is **not** usable: its RSS has only `<title>` and `<link>` — no article
  text to summarise — and Hindi titles regardless of the `Lang` parameter.
  Using it needs a fetcher for each `PressReleaseIframePage`. This is the
  single biggest content improvement still available.
- Indian Express Explained 403s from the server's IP (works from a home
  connection), so it cannot be used here.
- Relevance scoring is a heuristic over the AI's free text and still lands
  almost everything at 0.8, so the "EXAM RELEVANT" badge does not discriminate.
  A numeric score from the AI service is the real fix.

**AI service.** Rate limits used to escape as unhandled 500s because tenacity
reraises the original exception type and every router catches only `LlmError`.
Both clients now funnel all failures into `LlmError` / `EmbeddingsError`, and
provider error bodies are logged. MCQ generation was **never broken** — ~60% of
articles get quizzes; the model correctly declines for news with no exam angle.

---

## Open items

- **PIB ingestion** — needs a page fetcher (above). Biggest remaining win for
  current-affairs quality.
- **Numeric exam-relevance score** from the AI service, replacing the regex
  heuristic in `current-affairs.service.ts`.
- **`/admin/current-affairs/refresh` 504s at nginx** (~60s run). Either raise
  `proxy_read_timeout` or make it fire-and-forget.
- **Privacy policy URL + support contact** — required before public store
  release; the Help/Privacy entries were removed from the app's Me page.
- **Test accounts still live**: `poco-test@example.com` (student) and
  `dev-verify-admin@example.com` (admin). Remove before release.
- **Mobile not rebuilt for a device** since the coach-checkbox change. The
  emulator build is current; the POCO is not.

---

## Conventions worth not relearning

- Fee amounts are **never** accepted from the client — always resolved
  server-side from the plan or the course fee.
- UPI is a collect-request QR with **manual staff confirmation**; there is no
  gateway or webhook. Deliberate.
- Show real data or show nothing — placeholder progress bars, invented ratings
  and hardcoded stats have all been removed from the app once already.
- Bunny **Stream** (video) is configured; Bunny **Storage** never was. Course
  thumbnails are served from server disk via `/api/v1/uploads/images/:file`.
