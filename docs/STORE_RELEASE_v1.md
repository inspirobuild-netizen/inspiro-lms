# Inspiro v1.1.1 — store release pack

Everything needed to submit the first version to Google Play and the App
Store, in the order to do it. Code side is done; what remains is console work
that needs the academy's own accounts.

Build under submission: **1.1.1**, Android `versionCode 2010` (AAB), iOS build
number = the CI run number.

---

## 0. Before either submission — content

The review account must land in a batch that actually has classes. At the
time of writing every batch in production has **0 playable videos**. A
reviewer signing in to an empty course is the single most common reason an
education app is rejected ("app appears incomplete").

Put into the batch the review account is enrolled in — `001` under
*Junior IAS Stream 1* — at least: 3 video classes (uploaded, not linked),
2 notes PDFs, and 1 published test with 5+ questions.

Also rename **"Juniro IAS Stream 2"** — it is published and reviewers will
see the typo in the catalogue.

## 1. Review / demo account (both stores)

| | |
|---|---|
| Mobile number | `+91 7000000001` (enter `7000000001`) |
| One-time code | `430915` |
| What it is | Firebase test number — no SMS is sent; the code always works |
| Enrolled in | batch `001`, *Junior IAS Stream 1*, active |

Review notes to paste (both consoles):

> Sign in with mobile number 7000000001 (country +91). The one-time code is
> 430915 — this is a test number, no SMS is sent. The account is already
> enrolled in a course; open Learn to see classes, notes and tests. Enrolment
> in this version is arranged by the academy offline; the app does not sell
> anything and contains no purchases. Live classes require a scheduled
> session and may show none during review. Account deletion is under
> Profile → Delete my account.

---

## 2. Google Play

### 2.1 Account
You need a Play Console developer account owned by the academy. If it is a
**personal** account, Play requires a closed test with 12 opted-in testers for
14 days before production is unlocked; an **organisation** account (needs a
D-U-N-S number) does not. Check which you have before planning dates.

### 2.2 Create the app
Play Console → Create app → name **Inspiro IAS Academy**, default language
English (India), App, Free.

### 2.3 Upload
Release → Testing → Internal testing → Create release → upload
`app-release.aab`. Accept Play App Signing (Google holds the final key; the
keystore in `mobile/android/inspiro-release.jks` becomes the upload key).
Internal testing has no reviewer gate — use it to confirm the store build
installs and signs in on a real phone before going further.

### 2.4 Store listing
- **App name:** Inspiro IAS Academy
- **Short description (80):** Civil-service coaching from Inspiro — classes, notes, tests and mentors.
- **Full description:**

  Inspiro IAS Academy's official app for its students. Sign in with your
  mobile number and everything from your batch is in one place:

  • Video classes and notes for every module, in the order your batch
    follows
  • Weekly, monthly and annual tests with instant results, marks and rank
  • Doubts answered by your mentor, or by an AI assistant when you choose
  • Activities set by your mentors, submitted from your phone with a photo
    or PDF
  • Live classes with your instructors
  • Daily current affairs
  • Streaks, XP and a batch leaderboard to keep you going

  The app is for students enrolled with Inspiro IAS Academy. Enrolment is
  arranged by the academy; once you are enrolled, your classes appear here.

- **Category:** Education. **Contact email:** inspiroiasacademy@gmail.com.
  **Phone:** +91 9747 558 313. **Website:** https://inspiroiasacademy.in
- **Privacy policy URL:** https://api.inspiroiasacademy.in/legal/privacy
- **Graphics:** icon 512×512 (export from `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png`),
  feature graphic 1024×500 (make one — logo on the brand blue is enough),
  4–8 phone screenshots (see §4).

### 2.5 App content (Policy section) — answers
- **Privacy policy:** the URL above.
- **Ads:** No.
- **App access:** *All or some functionality is restricted* → add the
  review account from §1.
- **Content rating:** Education app; answer "no" to violence, sexual
  content, gambling, user-generated content is present but moderated
  (doubts, activities, feedback are seen only by the academy's staff).
- **Target audience:** 16–17 and 18+. Not designed for children.
- **News app:** No. **COVID-19 app:** No. **Government app:** No.
- **Data safety** (collected = sent off the device):
  - Personal info — Name, Phone number, Email address: collected, required
    (phone) / optional (email), for app functionality and account
    management. Not shared with third parties for their own use.
  - Photos: collected only when the student attaches one to an activity,
    optional, app functionality.
  - Audio/Video: only during a live class, not stored.
  - App activity — in-app actions (progress, test attempts): collected, app
    functionality and analytics for the academy.
  - App info and performance — crash logs: not collected by us (no crash
    SDK). Diagnostics: no.
  - Device or other IDs: push-notification token, app functionality.
  - Data is encrypted in transit: **Yes**. Users can request deletion:
    **Yes** — in-app, and https://api.inspiroiasacademy.in/legal/delete-account
- **Account deletion URL:** https://api.inspiroiasacademy.in/legal/delete-account
- **Permissions declaration:** the app requests camera and microphone
  (live classes), photos (activity uploads), notifications. No foreground
  service declaration is needed — the only foreground-service type left
  after this build is the generic one Agora uses during a live class; if
  Play asks for a justification, "keeps the live-class audio running while
  the student switches apps" is accurate.
- **Financial features:** No — the app has no payments in this version.

### 2.6 Then
Promote the internal-testing release to Production (or Closed testing if on
a personal account) and submit. First reviews take 1–7 days.

---

## 3. App Store

### 3.1 Credentials into the repo (one time)
Repository → Settings → Secrets and variables → Actions. Add exactly these
four, copied from the repo that ships the Kinvo app — they are Apple-account
level, not per-app:

`APPSTORE_ISSUER_ID`, `APPSTORE_KEY_ID`, `APPSTORE_API_KEY`, `CERTIFICATE_PRIVATE_KEY`

### 3.2 Push (APNs) — needed for notifications AND for phone sign-in
Apple Developer → Certificates, Identifiers & Profiles → Keys → create an
**APNs** key (.p8). Then Firebase Console → project `inspiro-b394e` → Project
settings → Cloud Messaging → iOS app → upload the .p8 with its Key ID and
your Team ID.

Without this, sign-in on iPhone falls back to a reCAPTCHA sheet (works, but
clunky) and no notifications arrive.

**Done 2026-10-03.** Key `6G835B9KAC` ("APN PUSH KEY", team-scoped, Sandbox &
Production, team `M46HPVLPMC`) is uploaded on both the development and the
production row. It is the same key Kinvo's call pushes use — never revoke it,
and Apple allows the `.p8` to be downloaded only once, so the copy on the
Desktop is the only one. It was missing when 1.1.1 was reviewed.

### 3.3 Build and upload
GitHub → Actions → **iOS** → Run workflow (branch `main`). The
`iOS — TestFlight` job fetches signing files from App Store Connect,
creating the App ID `com.bizence.inspiro` on the first run, builds, and
uploads. ~20 minutes. The build then appears under TestFlight in App Store
Connect within ~10 minutes of upload.

### 3.4 App Store Connect record
My Apps → ➕ → New App: iOS, name **Inspiro IAS Academy**, bundle
`com.bizence.inspiro`, SKU `inspiro-ios`, primary language English (India).

- **Category:** Education. **Age rating:** answer the questionnaire — no
  objectionable content; result will be 4+ or 12+.
- **Privacy policy URL:** https://api.inspiroiasacademy.in/legal/privacy
- **App Privacy (nutrition labels):** same facts as Play's Data Safety.
  Contact Info (name, phone, email) — linked to identity, app functionality.
  User Content (photos, other — submissions, doubts) — linked, app
  functionality. Usage Data (product interaction) — linked, app
  functionality. Identifiers (device ID — push token) — linked, app
  functionality. **Not** used for tracking.
- **Screenshots:** 6.7" (iPhone 15 Pro Max) and 6.5" sets are enough
  today; Apple scales down. See §4.
- **iPhone-only.** `TARGETED_DEVICE_FAMILY = 1` in the Xcode project. A
  universal build makes App Store Connect demand 13" iPad screenshots and
  makes Apple review the phone-designed layouts on an iPad. Apple allows
  *adding* iPad support in a later version but never *removing* it, so v1
  must ship iPhone-only if iPad is ever to be optional. The app still
  installs on iPad in the scaled iPhone window.
- **Description:** same text as Play. **Keywords:** IAS, UPSC,
  civil service, coaching, Inspiro.
- **Support URL:** https://inspiroiasacademy.in. **Marketing URL:** same.
- **App Review Information:** sign-in required → the account in §1, plus
  the review notes. Contact: academy phone + email.
- **Export compliance:** app uses only standard HTTPS — already declared in
  Info.plist (`ITSAppUsesNonExemptEncryption = false`), so no prompt.

### 3.5 Then
Select the TestFlight build, Submit for Review. First reviews take 1–3
days. If rejected, the rejection reason is specific — send it over as-is.

---

## 4. Screenshots (both stores)

Take them on the POCO signed in as the review account, after content is in
place (§0). Six frames, in this order:

1. Home — banners and today's overview
2. Learn — the course with its modules
3. A class playing (uploaded video, not a linked one)
4. Exams — a test with the marking scheme
5. Doubts — the mentor / AI choice visible
6. Profile

The same frames work for iOS; Apple accepts Android-proportioned images at
6.5"/6.7" sizes as long as the pixel dimensions match its list — resize to
1290×2796 for 6.7".

---

## 5. What is deliberately NOT in v1

- No in-app payment. The bank gateway (HDFC) lands in v2 behind
  `--dart-define=IN_APP_PAYMENTS=true`; the code is already in the app and
  the server. Enrolment in v1 is arranged by the academy and recorded by
  staff in the admin panel.
- No demo mode, no email login — phone OTP only.

## 6. After approval

- Register the **release** fingerprint in Firebase is already done; keep the
  debug one too.
- Back up `mobile/android/inspiro-release.jks` and its password somewhere
  durable. If Play App Signing was accepted, a lost upload key can be
  reset; if not, a lost key means a new app listing.
- Every future Play upload must be built with `flutter build appbundle`
  (version code from `pubspec.yaml`) and a higher `+N` than 2010.

## 7. Sign-in on the Play-distributed build (the "not authorised" error)

Play App Signing re-signs every AAB with **Google's** key, so the build
testers install from Play carries a different certificate from the upload
keystore. Firebase phone auth checks the *installed* build's certificate, so
with only the debug and upload fingerprints registered the Play build fails
with `app-not-authorized` — shown in the app as "This app build is not
authorised to sign in yet".

One-time fix, no rebuild — done 2026-09-24, all five certificates below are
registered. Repeat only if Google rotates the signing key.

**Do not trust the fingerprints shown in Play Console.** Its Play app signing
page (Protected with Play → Play Store protection → Manage Play app signing)
shows a "Classical key" and a "Post-quantum cryptography key"; those are the
**v3.2 hybrid signers, which only Android 17+ (API 37) verifies**. Today's
phones verify the v2/v3 signer, whose certificate is a different key that
the page does not show. Read the certificates out of the shipped APK instead:

```
adb pull "$(adb shell pm path com.bizence.inspiro | sed 's/^package://' | grep base.apk)" play-base.apk
python mobile/tool/apk_signers.py play-base.apk
```

(`apksigner` cannot do this — it aborts on the ML-DSA signer.) Register every
SHA-256 and SHA-1 it prints on the Android app in Firebase (`inspiro-b394e`):
console Project settings → Your apps → Android → Add fingerprint, or
`firebase apps:android:sha:create 1:933452768549:android:4ea571b1667d1826aca6cc <SHA>`.
Takes effect at the next sign-in attempt (force-close the app first).

| Signer | SHA-256 |
|---|---|
| v2/v3 (all current Android) | `7D:AD:C2:3C:4C:2B:8D:A0:22:F4:46:F0:49:11:F2:FE:84:C1:E3:60:ED:F0:A0:C9:A6:55:39:F2:43:5B:88:3F` |
| v3.2 classical (Android 17+) | `A3:74:CB:44:00:9B:D6:90:3A:0F:CB:A6:C9:87:9C:97:6C:ED:61:38:23:D9:69:4A:A8:4F:2A:43:A8:78:45:41` |
| v3.2 post-quantum (Android 17+) | `2A:83:C9:19:7D:D4:0E:AF:C1:96:BC:D7:B2:D0:8A:C5:BB:9D:41:5C:04:A1:2E:56:7B:18:0D:38:D2:B8:F4:33` |

The exact failure to look for in `adb logcat`:
`E/FirebaseAuth … 17028 A play_integrity_token was passed, but no matching
SHA-256 was registered`. The integrity request goes to Google's own project
(`cloudProjectNumber=551503664846`), so **no Play Integrity API enablement or
Cloud-project link is needed** for phone sign-in — that is App Check's
requirement, not Auth's.

The reCAPTCHA browser page during OTP is the fallback when Play Integrity
cannot vouch for the build. It is **always** shown for a sideloaded APK
(adb / shared file) and cannot be removed there. On the Play build it is gone
once the fingerprints above are registered — verified on a POCO M2 Pro
installed from the alpha track: integrity token, SMS, OTP accepted, no page.

## 8. App Store rejection of 1.1.1 (24 Sep 2026) and the resubmission

Apple rejected build 1.1.1 (40) on two guidelines.

**2.1 App Completeness — the reviewer could not sign in.** Their screenshot
shows the demo number typed and "Verification failed" under it, before any
code was asked for. Firebase runs *app* verification even for a fictional
test number: a silent push on iOS, falling back to a reCAPTCHA web sheet. On
a review device the push does not arrive and the sheet gets closed, and
either way the app only said "Verification failed".

Fixed in 1.1.3: for the fictional review numbers the app sets
`appVerificationDisabledForTesting`, which Firebase honours for fictional
numbers only, so the code screen appears at once. Proven against Identity
Toolkit with the iOS API key and bundle id — the review number gets a session
with no receipt and signs in; an ordinary number is refused with
`MISSING_CLIENT_IDENTIFIER`. The list lives in
`mobile/lib/features/auth/services/phone_auth_service.dart` and **must match
the Firebase console** (Authentication → Sign-in method → Phone → Phone
numbers for testing): a number in the app's list but not in the console
cannot sign in at all.

**3.2 Business — "who is this app for?"** Our own words caused it: the
description said the app "is for students enrolled with Inspiro IAS Academy"
and the review notes said enrolment "is arranged by the academy offline".
Apple reads that as an app for one organisation's members, which belongs in
private distribution. It is not: anyone can sign up in the app, and a
signed-up user gets daily current affairs, the AI doubt assistant, the AI
coach's weekly plan, streaks/leaderboard and the catalogue without enrolling.
The fix is to say so — in the description, in the notes, with a second demo
account that shows it, and in a reply to the reviewer.

### 8.1 Demo accounts

| | Mobile | Code | Shows |
|---|---|---|---|
| A | `7000000001` | `430915` | An enrolled student — batch `001`, *Junior IAS Stream 1* |
| B | `7000000002` | `430915` | A member of the public who has not enrolled |

Both are Firebase fictional numbers; no SMS is sent. B is named "Guest
Aspirant" and lands on Home directly.

### 8.2 Before pressing Resubmit

1. Firebase console: add `+91 7000000002` as a test number (code above).
2. The review batch must look alive: every lesson must open (a linked
   YouTube video has to be *Unlisted* with *Allow embedding* on — a private
   or embed-disabled one shows "This class can't be played right now"), and
   at least one published test must be attached to the batch so the Exams tab
   is not empty.
3. GitHub → Actions → **iOS** → Run workflow → build 1.1.3.
4. Install that build from TestFlight on a real iPhone and sign in with A, B
   and one real number. Nobody had run the iOS build on a device before it
   was first submitted; that must not happen twice.
5. App Store Connect, on the rejected version: change the version number to
   **1.1.3**, replace the build, paste the description (§8.5) and the review
   notes (§8.4), send the reply (§8.3), Resubmit.

### 8.3 Reply to App Review

> Hello,
>
> Thank you for the review. Both issues are addressed in build 1.1.3.
>
> **Guideline 2.1 — sign-in.** The demo number is a test number that never
> receives an SMS. In build 1.1.1 the app still tried to verify the device
> before asking for the code, and that step failed on your device. In 1.1.3
> the demo numbers skip that step: enter the number, tap Send OTP, and the
> code screen appears.
>
> Demo account A — an enrolled student: mobile 7000000001, code 430915
> Demo account B — a member of the public, not enrolled: mobile 7000000002, code 430915
> (The country code is fixed at +91. No SMS is sent to these numbers.)
>
> **Guideline 3.2 — audience and business model.** The app is for the general
> public, not for a closed organisation.
>
> 1. *Is the app restricted to users who are part of a single company?* No.
>    Inspiro IAS Academy is a coaching institute preparing students for
>    India's civil-service (UPSC) examination, and this is its consumer app
>    for learners. Anyone can download it and create an account; no
>    invitation, approval or prior relationship with the academy is needed.
> 2. *Is it designed for a limited or specific group of companies?* No. It is
>    not a business-to-business product and has no client companies.
> 3. *Which features are for the general public?* Every user who signs up
>    gets, free and without enrolling: a daily current-affairs feed written
>    for the UPSC syllabus, each item with its exam relevance and a quiz
>    question; an AI assistant that answers study questions; a weekly study
>    plan from an AI coach; streaks and a leaderboard; and the academy's
>    course catalogue. Demo account B shows exactly this.
> 4. *How do users obtain an account?* In the app: Sign up → mobile number →
>    one-time code. Sign-up uses Indian mobile numbers because the
>    examination and the academy are in India.
> 5. *Is there paid content, and who pays?* The academy's coaching programmes
>    are paid tuition for a taught educational service — classes by its
>    faculty, live sessions, mentoring and evaluated tests — which a student
>    joins by enrolling with the academy directly, as with any school or
>    coaching institute. Students who have enrolled see their batch's class
>    recordings, notes and tests in the app (demo account A). The app itself
>    sells nothing: there are no in-app purchases, no prices are shown, and
>    there are no links or prompts to pay outside the app.
>
> We have also rewritten the App Store description to make the public
> features clear.
>
> Thank you.

Answer 5 must stay true: if a programme is ever sold as recorded content
alone, with no teaching service around it, Apple will expect in-app purchase.

### 8.4 App Review notes (replaces §1)

Sign-in fields: user name `7000000001`, password `430915`. Notes:

> SIGN-IN — no SMS is sent to these numbers; the code always works. The
> country code is fixed at +91.
> A) Enrolled student: mobile 7000000001, code 430915
> B) Member of the public, not enrolled: mobile 7000000002, code 430915
> Tap "Log in", enter the 10-digit number, tap "Send OTP", enter the code.
>
> WHAT EACH ACCOUNT SHOWS
> B (public, free): Home → Affairs (daily current affairs with a quiz
> question), Doubts (AI assistant), Coach (weekly study plan), the
> leaderboard; Learn → Explore courses (the catalogue).
> A (enrolled): Learn → Junior IAS Stream 1 → Class 1 — video classes and a
> notes PDF; Exams — the batch's test.
>
> ABOUT THE APP
> Free app for civil-service (UPSC) aspirants in India. Anyone can sign up in
> the app with a mobile number. The academy's coaching programmes are joined
> by enrolling with the academy directly; the app has no in-app purchases,
> shows no prices and has no payment links. Live classes appear only when one
> is scheduled, so the Live tab may be empty during review. Account deletion:
> Profile → Delete my account.

### 8.5 Store description (replaces §2.4, both stores)

> Inspiro IAS Academy's app for civil-service aspirants.
>
> Sign up free with your mobile number and get, every day:
>
> • Current affairs written for the UPSC syllabus — each with its exam
>   relevance and a quick quiz question
> • An AI assistant for your study doubts: ask a question, get a clear
>   explanation
> • A weekly study plan from your AI coach
> • Streaks and a leaderboard to keep your preparation on track
> • The academy's course catalogue
>
> Students of Inspiro's coaching programmes also get their batch in the app:
>
> • Video classes and notes, in the order the batch follows
> • Tests with instant results
> • Live classes with instructors
> • Activities and feedback from mentors
>
> Inspiro IAS Academy, Marine Drive, Kochi.
