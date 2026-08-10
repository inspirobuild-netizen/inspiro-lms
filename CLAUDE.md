# CLAUDE.md — Inspiro LMS
# Civil Services Coaching Platform — Full-Stack Project Context
# Read this file completely before writing any code.

---

## Project identity

**Product:** Inspiro LMS — AI-powered civil services coaching platform
**Client:** Inspiro (coaching institution, Kerala, India)
**Developer:** Bizence Solutions
**Target users:** Civil services aspirants aged 15–25 (UPSC, Kerala PSC, State PSC)
**Scale target:** 10,000 registered users, 3,000 concurrent (Phase 1)
**Current phase:** Phase 1 MVP

---

## Monorepo structure

```
inspiro/
├── CLAUDE.md                  ← you are here
├── .env.example               ← env template (never commit .env)
├── docker-compose.yml         ← local dev orchestration
├── docker-compose.prod.yml    ← production orchestration
│
├── apps/
│   ├── api/                   ← Node.js Fastify backend
│   │   ├── src/
│   │   │   ├── modules/       ← feature modules (auth, courses, exams…)
│   │   │   ├── lib/           ← shared utilities, db client, redis
│   │   │   ├── middleware/    ← auth guard, rate limit, error handler
│   │   │   └── index.ts       ← server entry point
│   │   ├── drizzle/           ← DB schema + migrations
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ai/                    ← Python FastAPI AI microservice (Phase 2)
│   │   ├── routers/           ← doubt, exam_gen, current_affairs
│   │   ├── services/          ← groq_client, rag_pipeline, embeddings
│   │   ├── main.py
│   │   └── requirements.txt
│   │
│   └── admin/                 ← Next.js 14 admin dashboard
│       ├── app/               ← App Router pages
│       ├── components/        ← shared UI components
│       ├── lib/               ← api client, auth, utils
│       └── package.json
│
└── mobile/                    ← Flutter app
    ├── lib/
    │   ├── main.dart
    │   ├── theme/             ← InspiroTheme, colors, spacing, text styles
    │   ├── router/            ← GoRouter routes
    │   ├── features/          ← feature-first structure
    │   │   ├── auth/
    │   │   ├── home/
    │   │   ├── courses/
    │   │   ├── exams/
    │   │   ├── live/
    │   │   ├── doubt/
    │   │   ├── leaderboard/
    │   │   └── profile/
    │   └── shared/            ← widgets, constants, extensions
    ├── test/
    └── pubspec.yaml
```

---

## Tech stack — exact versions

### Backend API (`apps/api/`)
| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Framework | Fastify | 4.x |
| Language | TypeScript | 5.x |
| ORM | Drizzle ORM | latest |
| Validation | Zod | 3.x |
| Auth | jose (JWT) | 5.x |
| Queue | BullMQ | 5.x |
| Cache | ioredis | 5.x |
| Logger | Pino | 9.x |
| Error tracking | @sentry/node | 8.x |
| File upload | @fastify/multipart | latest |
| Rate limit | @fastify/rate-limit | latest |
| CORS | @fastify/cors | latest |
| HTTP client | undici | latest |

### Database
| Service | Provider | Notes |
|---|---|---|
| PostgreSQL 15 | Neon.tech (managed) | pgvector enabled |
| Redis 7 | Self-hosted on VPS | BullMQ + cache + OTP |
| Search | Meilisearch | Self-hosted (Phase 2) |

### AI service (`apps/ai/`) — Phase 2
| Layer | Technology |
|---|---|
| Runtime | Python 3.11 |
| Framework | FastAPI + uvicorn |
| LLM API | Groq (LLaMA 3.3 70B) |
| RAG | LangChain |
| Embeddings | sentence-transformers |
| Vector store | pgvector (PostgreSQL) |
| OCR | Google Vision API |

### Admin dashboard (`apps/admin/`)
| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| UI | shadcn/ui + Radix UI |
| Charts | Recharts |
| Tables | TanStack Table v8 |
| Forms | React Hook Form + Zod |
| State | Zustand + TanStack Query |
| Hosting | Vercel |

### Flutter mobile app (`mobile/`)
| Layer | Technology |
|---|---|
| Framework | Flutter 3.x (stable) |
| Language | Dart 3.x |
| State | Riverpod (flutter_riverpod) |
| Navigation | GoRouter |
| HTTP | Dio |
| Local DB | Hive / Isar |
| Video | media_kit |
| Live class | agora_rtc_engine |
| Push | firebase_messaging |
| Crash | firebase_crashlytics |
| Animations | flutter_animate |

### Infrastructure
| Service | Provider | Purpose |
|---|---|---|
| VPS (API + Redis) | Hostinger KVM 2 | New server, Inspiro-only |
| VPS (AI service) | Hostinger KVM 2 | Phase 2, separate |
| Container | Docker + Compose | All services containerized |
| Reverse proxy | Nginx | SSL termination, routing |
| SSL | Cloudflare | Free, auto-renew |
| Video CDN | Bunny Stream | HLS streaming + DRM |
| File storage | Backblaze B2 | PDFs, images |
| Push | Firebase FCM | Student notifications |
| Payments | Razorpay | Phase 2 |

---

## Environment variables

Never hardcode secrets. All config via environment variables.

```bash
# apps/api/.env

# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database (Neon.tech connection string)
DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/inspiro?sslmode=require

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=                    # min 64 chars, random
JWT_REFRESH_SECRET=            # min 64 chars, different random
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d

# Bunny Stream
BUNNY_STREAM_API_KEY=
BUNNY_STREAM_LIBRARY_ID=
BUNNY_CDN_HOSTNAME=

# Backblaze B2
B2_KEY_ID=
B2_APP_KEY=
B2_BUCKET_NAME=
B2_ENDPOINT=

# Groq (Phase 2)
GROQ_API_KEY=

# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Sentry
SENTRY_DSN=

# Razorpay (Phase 2)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

---

## Database schema — core tables

Always use Drizzle ORM. Never write raw SQL with user input.
Schema lives in `apps/api/drizzle/schema.ts`.

### Key entities and relationships

```
users (id, phone, email, name, role, avatar_url, target_exam, created_at)
  └── batch_enrollments (user_id → batches.id, enrolled_at, status)
  └── exam_attempts (user_id → exams.id, score, rank, submitted_at)
  └── doubts (student_id → users.id, subject, body, ai_answer, status)
  └── attendance (student_id, batch_id, date, type, status)
  └── streaks (user_id, current_streak, last_study_date, total_xp)

batches (id, name, type[online/offline/hybrid], target_exam, start_date, end_date, capacity)
  └── batch_instructors (batch_id, instructor_id)
  └── batch_courses (batch_id, course_id)

courses (id, title, subject, thumbnail_url, is_published, created_by)
  └── modules (id, course_id, title, order, unlock_date)
      └── lessons (id, module_id, type[video/pdf/audio], bunny_video_id, duration)

exams (id, title, subject, duration_mins, neg_marks, schedule_start, schedule_end, batch_ids[])
  └── questions (id, subject, chapter, difficulty, body, options[4], correct_index, explanation)
  └── exam_attempts (id, exam_id, student_id, score, answers_json, started_at, submitted_at)

live_classes (id, batch_id, subject, instructor_id, start_time, agora_channel, recording_url)
notifications (id, user_id nullable, title, body, type, read_at)
leaderboard (id, student_id, batch_id, period, total_score, rank, updated_at)
current_affairs (id, title, summary, category, upsc_relevance, published_at)
```

---

## API conventions

### Route structure
```
POST   /api/v1/auth/send-otp
POST   /api/v1/auth/verify-otp
POST   /api/v1/auth/refresh

GET    /api/v1/courses
GET    /api/v1/courses/:id
GET    /api/v1/courses/:id/modules

GET    /api/v1/exams
POST   /api/v1/exams/:id/start
POST   /api/v1/exams/:id/submit
GET    /api/v1/exams/:id/result

POST   /api/v1/doubts
GET    /api/v1/doubts/my

GET    /api/v1/leaderboard
GET    /api/v1/profile/me
```

### Response envelope — always use this shape
```typescript
// Success
{
  success: true,
  data: T,
  meta?: { page, limit, total }   // for paginated responses
}

// Error
{
  success: false,
  error: {
    code: string,      // e.g. "INVALID_OTP", "EXAM_NOT_FOUND"
    message: string,   // human-readable
    details?: unknown  // validation errors, field-level
  }
}
```

### Auth pattern
- Access token: 15 min JWT in Authorization header `Bearer <token>`
- Refresh token: 30-day JWT in httpOnly cookie
- All protected routes use `authenticate` preHandler hook
- Role check: `requireRole(['admin', 'instructor'])` preHandler
- Never return passwords, tokens, or internal IDs in responses

### Rate limiting (per endpoint category)
```
/auth/*           → 10 req/min per IP
/api/*            → 200 req/min per authenticated user
/api/*/admin/*    → 500 req/min per admin
```

---

## Flutter conventions

### State management pattern
Use Riverpod. Every feature follows this structure:
```
features/
  courses/
    data/
      courses_repository.dart     ← API calls via Dio
      courses_remote_datasource.dart
    domain/
      course_model.dart           ← Freezed data classes
    presentation/
      courses_screen.dart
      widgets/
        course_card.dart
      providers/
        courses_provider.dart     ← AsyncNotifierProvider
```

### Navigation
GoRouter only. No Navigator.push directly.
Route constants in `lib/router/routes.dart`.
```dart
// Route names as constants
class Routes {
  static const home = '/home';
  static const courseDetail = '/courses/:id';
  static const activeExam = '/exams/:id/active';
  // ...
}
```

### Theme usage
The complete design system is in `lib/theme/`.
```dart
// Always use theme tokens — never hardcode colors
context.inspiro.surface1         // card background
context.inspiro.tealLight        // progress bars
InspiroTextStyles.cardTitle      // text styles
InspiroSpacing.space4            // 16dp padding
InspiroRadius.card               // 16dp corner radius
```

### API calls pattern
```dart
// All API calls in repository, wrapped in Either/Result
// Use Dio with interceptors for:
// - JWT injection
// - 401 → auto refresh token → retry
// - Error normalisation
// Never call Dio directly from a widget or provider
```

### Loading states
Always show skeleton loaders (shimmer package), never spinners.
Error states always show a retry button.
Empty states always show an illustration + action CTA.

---

## Design system — key tokens

### Colors (from inspiro_colors.dart)
```
Primary brand:    #5B21B6 (violet)
Interactive:      #7C3AED (violet bright)
Progress/Live:    #14B8A6 (teal light)
Achievement/XP:   #F59E0B (amber)
Success/Correct:  #10B981 (emerald)
Error/Wrong:      #E11D48 (rose)

Dark bg:          #0D0F1A
Card surface:     #13162A
Elevated card:    #1A1F3A
Modal surface:    #1E2445
```

### Fonts
- Headings/UI: Plus Jakarta Sans (700, 800)
- Body/labels: Inter (400, 500)
- Numbers/scores/timers: JetBrains Mono (500, 700)

### Spacing scale
space1=4, space2=8, space3=12, space4=16, space6=24, space8=32, space12=48

### Radius
chip=8, button=12, card=16, modal=24, pill=9999

---

## Module build order — Phase 1

Build in this exact sequence. Do not skip ahead.

```
Week 1–2:  Project scaffold + Docker Compose + Nginx config
Week 3–4:  Database schema + Drizzle migrations + seed data
Week 5–6:  Auth module (OTP + JWT + refresh tokens)
Week 7–8:  User + Batch + Enrollment APIs
Week 9–10: Course + Module + Lesson APIs
Week 11:   Bunny Stream integration (upload webhook + signed URLs)
Week 12:   Flutter app scaffold + theme + GoRouter + auth screens
Week 13:   Flutter home + course list + course detail screens
Week 14:   Video player (media_kit + Bunny HLS)
Week 15:   Exam engine API (create, start, submit, score)
Week 16:   Exam engine Flutter (question UI, timer, result)
Week 17:   Admin dashboard scaffold + auth + student management
Week 18:   Admin courses + batch management
Week 19:   Live class (Agora provisioning API + Flutter viewer)
Week 20:   Push notifications (FCM) + leaderboard
Week 21:   Admin analytics page + export
Week 22:   QA + load testing + Play Store submission
```

---

## Security rules — never break these

1. Never put secrets in code — always env vars
2. Never log sensitive data (phone numbers, tokens, passwords)
3. All DB queries via Drizzle ORM parameterized — no string concat SQL
4. Validate ALL input with Zod before processing
5. Bunny Stream URLs always signed with expiry — never expose raw storage URLs
6. Exam screens: enforce fullscreen, detect tab switch, block screenshot
7. JWT refresh token rotation — blacklist old token in Redis on use
8. Admin routes: always check role in middleware, not in handler
9. Rate limit all auth endpoints strictly (10 req/min per IP)
10. Never return stack traces to client in production

---

## Docker Compose — local dev

```yaml
# docker-compose.yml (reference — full file in repo root)
services:
  api:
    build: ./apps/api
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=development
    depends_on: [redis]
    volumes:
      - ./apps/api:/app
      - /app/node_modules

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes:
      - redis_data:/data

  # Note: PostgreSQL NOT in Docker — use Neon.tech connection string
  # Note: Admin dashboard runs separately via `pnpm dev` in apps/admin/
  # Note: Flutter runs via `flutter run` on device/emulator
```

---

## Deployment — production (Hostinger KVM, Ubuntu 24.04)

```
Server:   root@200.97.162.147   (hostname srv1811142)
Path:     /opt/inspiro
Services: inspiro-api · inspiro-ai · inspiro-redis · inspiro-nginx

Domains:
  api.inspiroiasacademy.in    → API container (port 3000)
  admin.inspiroiasacademy.in  → Vercel (deploys on push to main)
```

**The API server IP is 200.97.162.147.** An older box, `72.60.111.107`, still
accepts connections but no longer serves anything and rejects the deploy key —
deploying there silently does nothing. Confirm with
`nslookup api.inspiroiasacademy.in` before assuming a host.

### Deployment workflow

Backend and AI deploys **copy changed files** — the server's git checkout is
intentionally behind main and carries local edits, so `git pull` there would
conflict. Images are built on the server; there is no registry to pull from.

```bash
# 1. Copy only the files you changed
scp apps/api/src/<path>.ts root@200.97.162.147:/opt/inspiro/apps/api/src/<path>.ts

# 2. Rebuild + restart that service (api | ai)
ssh root@200.97.162.147 'cd /opt/inspiro && \
  docker compose -f docker-compose.prod.yml build api && \
  docker compose -f docker-compose.prod.yml up -d api'
```

The Docker build runs `tsc`, so a type error fails the build rather than
shipping. Verify against the live API afterwards — the build succeeding only
means it compiled.

Admin deploys by pushing to `main` (Vercel). Mobile is built locally with
`flutter build apk --target-platform android-arm64,android-x64` (both ABIs, so
one APK installs on a real device and the x86_64 emulator).

Migrations run from a dev machine against Neon: `pnpm db:migrate:http`.
Direct TCP to Neon (port 5432) is blocked on some networks; the HTTP driver
works regardless.

### Deployment gotchas found the hard way

- Secrets live in `/opt/inspiro/.env.production` on the server and are **not**
  in git. Back it up before editing (`cp .env.production .env.production.bak.$(date +%F-%H%M%S)`).
- `POST /admin/current-affairs/refresh` takes ~60s and 504s at nginx while
  completing fine server-side — check the DB, not the HTTP response.
- Bodyless `POST`/`PATCH` from Dio must send `data: {}`; Fastify rejects
  `Content-Type: application/json` with an empty body (`FST_ERR_CTP_EMPTY_JSON_BODY`).

---

## What NOT to do

- Never use `any` in TypeScript — always type properly
- Never use `setState` in Flutter for async API calls — use Riverpod
- Never call the database directly from route handlers — always through a service layer
- Never store video files on the VPS — always Bunny Stream
- Never use `console.log` in production — use Pino logger
- Never commit `.env` files — `.gitignore` must include them
- Never use raw SQL strings with user input — always Drizzle parameterized
- Never return HTTP 200 for errors — use correct status codes
- Never skip Zod validation on any endpoint
- Never use Flutter's Navigator.push directly — always GoRouter

---

## Phase 1 deliverable checklist

### Backend API
- [ ] Project scaffold with Fastify + TypeScript + Drizzle
- [ ] Docker Compose (API + Redis)
- [ ] Nginx config with SSL
- [ ] Auth: OTP via SMS, JWT issue/refresh/revoke
- [ ] Users: CRUD, profile, role management
- [ ] Batches: CRUD, enrollment, timetable
- [ ] Courses: hierarchy (course > module > lesson), drip unlock
- [ ] Bunny Stream: upload webhook, signed URL generation
- [ ] Exams: create, question bank, attempt lifecycle, auto-scoring
- [ ] Live classes: Agora channel provisioning, attendance webhook
- [ ] Notifications: FCM dispatch service
- [ ] Leaderboard: weekly compute via cron
- [ ] Admin API endpoints for all above

### Flutter App
- [ ] App scaffold + InspiroTheme + GoRouter
- [ ] Onboarding + Auth screens (OTP flow)
- [ ] Profile setup (3-step)
- [ ] Home dashboard (streak, live card, continue learning, rank peek)
- [ ] Course list + course detail
- [ ] Video player (Bunny HLS + resume + speed control)
- [ ] Exam engine (MCQ, timer arc, palette, auto-submit, result)
- [ ] Leaderboard (podium + ranked list)
- [ ] Basic profile screen
- [ ] FCM push notification handling
- [ ] Play Store build (APK + AAB)

### Admin Dashboard
- [ ] Next.js scaffold + Tailwind + shadcn/ui
- [ ] Auth (admin login + 2FA)
- [ ] Dashboard overview (KPI cards + charts)
- [ ] Student management (list, search, bulk import)
- [ ] Batch management (create, enroll, timetable)
- [ ] Course builder (hierarchy + Bunny upload)
- [ ] Exam management (create, question bank, schedule)
- [ ] Live class scheduling + monitoring
- [ ] Basic analytics

---

## Session startup checklist for Claude Code

When starting a new Claude Code session on this project:

1. Read this CLAUDE.md fully
2. Check which week/module is being worked on (see build order above)
3. Look at existing code in the relevant module directory before writing new code
4. Follow the existing patterns — do not introduce new libraries without checking here first
5. Run `pnpm typecheck` after writing TypeScript — fix all errors before moving on
6. Write the service layer first, then the route handler, then tests
7. For Flutter: write the model first, then the repository, then the provider, then the UI

---

## Quick reference — package manager

- Backend + Admin: `pnpm` (not npm, not yarn)
- Flutter: standard `flutter` / `dart pub` commands
- Python AI: `pip` with `requirements.txt`

---

*Last updated: June 2026 | Phase: 1 MVP | Stack: Node.js + Flutter + Next.js*
