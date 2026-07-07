# Inspiro LMS — Release Checklist

## AI Service (apps/ai)

- [ ] `GROQ_API_KEY` set (console.groq.com)
- [ ] `EMBEDDINGS_API_KEY` set — Jina key from jina.ai (swap provider later via `EMBEDDINGS_BASE_URL`/`EMBEDDINGS_MODEL`; keep dim 1024)
- [ ] `INTERNAL_API_KEY` generated (`openssl rand -hex 32`) — same value as the API's `AI_INTERNAL_KEY`
- [ ] `ENVIRONMENT=production` (disables /docs)
- [ ] Deployed on the internal Docker network only — never exposed via nginx
- [ ] Container healthcheck green (`/health`)

## Backend (API)

- [ ] All env vars set in production (run `checkEnv()` on startup — exits if missing)
- [ ] `NODE_ENV=production` in deployment env
- [ ] `AI_SERVICE_URL=http://ai:8000` + `AI_INTERNAL_KEY` set (matches AI service)
- [ ] Drizzle migrations applied: `pnpm --filter api db:migrate` (0001 enables pgvector — Neon supports it natively)
- [ ] After content is seeded: `POST /admin/rag/reindex` once to build the semantic index
- [ ] Redis flushed of test keys (`inspiro:test:*`)
- [ ] Rate limits verified (10 req/min on auth endpoints)
- [ ] MSG91: DLT registration approved, OTP template (with ##OTP##) approved, test OTP received on a real Indian number
- [ ] Sentry DSN configured and tested
- [ ] Bunny Stream token auth enabled (signed URLs with expiry)
- [ ] FCM service account JSON uploaded as env var (not a file in repo)
- [ ] JWT secrets rotated from defaults (min 32 chars each)
- [ ] CORS origin locked to production domain in `@fastify/cors`

## Admin Dashboard (Next.js)

- [ ] `NEXT_PUBLIC_API_URL` points to production API
- [ ] `next build` passes with no TypeScript errors
- [ ] Login flow tested end-to-end (phone → OTP → admin role check)
- [ ] Analytics CSV exports verified against production data
- [ ] Deployed to Vercel / hosting with HTTPS

## Flutter App (Android)

- [ ] `key.properties` in place at `mobile/android/` (not committed)
- [ ] Keystore backed up securely (separate from codebase)
- [ ] `versionCode` incremented in `pubspec.yaml` (`version: 1.0.0+N`) for each release
- [ ] Release build passes — always pass the API URL:
      `flutter build appbundle --release --dart-define=API_BASE_URL=https://api.inspiro.in`
      (without the dart-define the app points at the emulator default `10.0.2.2:3000`)
- [ ] Package note: namespace is `com.bizence.inspiro_mobile`, **applicationId is `com.bizence.inspiro`**
      (the applicationId is what Firebase + Play Console match — do not change it)
- [ ] ProGuard rules verified — app launches without ClassNotFoundException
- [ ] `google-services.json` at `mobile/android/app/` (package `com.bizence.inspiro`, not committed)
- [ ] FCM token registration tested on physical device
- [ ] Agora live class tested on real network (not emulator)
- [ ] Exam fullscreen + tab-switch detection verified on device
- [ ] Signed AAB uploaded to Play Console (Internal Testing track first)

## Play Store

- [ ] App ID: `com.bizence.inspiro`
- [ ] Short description (≤80 chars): "Kerala's smart civil services coaching — UPSC & PSC"
- [ ] Full description uploaded
- [ ] Screenshots: phone (min 2), 7" tablet optional
- [ ] Feature graphic (1024×500 px)
- [ ] Privacy policy URL set (required for apps requesting permissions)
- [ ] Content rating questionnaire completed
- [ ] Target audience: 18+ (no children's content)
- [ ] Data safety form completed (phone number, device token collected)
- [ ] Release notes written for first version
- [ ] Rolled out to Internal Testing → Closed Testing → Production
