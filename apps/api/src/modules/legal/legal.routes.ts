import type { FastifyInstance } from 'fastify';

/**
 * The legal pages both app stores demand a live URL for, served by the API
 * so they exist today. The marketing site links to /privacy-policy and
 * /terms but neither page has been built there; when they are, these can be
 * pointed at from the store listings instead, or left as they are.
 *
 * Plain HTML, no build step, no JavaScript: a reviewer opening it on a phone
 * gets a readable page in under a second.
 */

const ORG = 'Inspiro IAS Academy';
const EMAIL = 'inspiroiasacademy@gmail.com';
const PHONE = '+91 9747 558 313';
const ADDRESS = 'OS 3 GCDA Complex, Marine Drive, Cochin, Ernakulam, Kerala, India';
const UPDATED = '22 September 2026';

export default async function legalRoutes(app: FastifyInstance) {
  app.get('/legal/privacy', async (_req, reply) => reply.type('text/html; charset=utf-8').send(page('Privacy Policy', PRIVACY)));
  app.get('/legal/terms', async (_req, reply) => reply.type('text/html; charset=utf-8').send(page('Terms of Use', TERMS)));
  app.get('/legal/delete-account', async (_req, reply) => reply.type('text/html; charset=utf-8').send(page('Delete your account', DELETE)));
}

const PRIVACY = `
<p class="muted">Last updated ${UPDATED}</p>
<p>${ORG} ("we", "us") operates the Inspiro mobile app and related services. This policy explains what we collect, why, and what you can do about it. It applies to students, parents and staff who use the app.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Account details</strong> — your mobile number (used to sign in by one-time code), your name, and optionally an email address and profile photo.</li>
  <li><strong>Enrolment and fee records</strong> — the courses and batches you join, your admission record, fees due and payments made, including references such as a bank transaction id. We do not store card or bank account numbers.</li>
  <li><strong>Learning activity</strong> — which classes you watch and how far, notes you open, test attempts and scores, doubts you ask, activities you submit (including photos or PDFs you upload), feedback you give, streaks and leaderboard standing.</li>
  <li><strong>Device information</strong> — a push-notification token so we can notify you, and basic technical data (device model, OS version, app version) if the app reports an error.</li>
  <li><strong>Live classes</strong> — if you join a live class and turn on your microphone or camera, that audio or video is transmitted to the class in real time. It is not recorded by the app unless the class itself is being recorded, which is announced in the class.</li>
</ul>

<h2>How we use it</h2>
<ul>
  <li>To sign you in, keep you signed in, and secure your account.</li>
  <li>To give you access to the courses you are enrolled in and track your progress.</li>
  <li>To run tests, mark them, and show results and rankings.</li>
  <li>To answer your doubts — by a mentor, or by an AI assistant when you choose that option and the academy has it switched on.</li>
  <li>To send notifications about classes, tests, results and your enrolment.</li>
  <li>To keep fee and admission records the academy is required to retain.</li>
</ul>
<p>We do not sell personal data, and we do not use it for advertising.</p>

<h2>Services we rely on</h2>
<p>Some processing is carried out by service providers on our behalf, each bound to use the data only to provide their service to us:</p>
<ul>
  <li><strong>Google Firebase</strong> — phone-number sign-in and push notifications.</li>
  <li><strong>Bunny.net</strong> — secure storage and streaming of class videos.</li>
  <li><strong>YouTube</strong> — some classes are played through YouTube's embedded player; YouTube's own privacy policy applies to that playback.</li>
  <li><strong>Agora</strong> — real-time audio and video for live classes.</li>
  <li><strong>AI assistant</strong> — when you ask the AI to answer a doubt, the text of your question (not your name or number) is sent to an AI provider to generate the answer.</li>
  <li><strong>Hosting</strong> — our servers and database are hosted in India.</li>
</ul>

<h2>How long we keep it</h2>
<p>Your account and learning data are kept while your account is active. Admission and fee records are kept for as long as Indian law and the academy's accounting obligations require, even after an account is deleted; they are held against an anonymised record, not your name or number.</p>

<h2>Your choices</h2>
<ul>
  <li><strong>See or correct your details</strong> — from the profile screen in the app, or by contacting us.</li>
  <li><strong>Delete your account</strong> — from the app: <em>Profile → Delete my account</em>. Or ask us at ${EMAIL}. See <a href="/legal/delete-account">what deletion does</a>.</li>
  <li><strong>Notifications</strong> — turn them off in your phone's settings at any time.</li>
  <li><strong>Microphone and camera</strong> — only used in live classes, only when you turn them on, and controllable in your phone's settings.</li>
</ul>

<h2>Children</h2>
<p>The app is intended for students preparing for civil-service examinations, typically aged 16 and above. Where a student is under 18, we rely on the parent or guardian who enrolled them having consented to this policy.</p>

<h2>Security</h2>
<p>Data is transmitted over encrypted connections and stored on access-controlled systems. Sign-in codes expire within minutes. No system is perfectly secure; if we become aware of a breach affecting you, we will tell you.</p>

<h2>Changes</h2>
<p>If this policy changes materially we will note the new date here and, where appropriate, tell you in the app.</p>

<h2>Contact</h2>
<p>${ORG}<br>${ADDRESS}<br>${EMAIL}<br>${PHONE}</p>
`;

const TERMS = `
<p class="muted">Last updated ${UPDATED}</p>
<p>These terms apply to your use of the Inspiro mobile app and services provided by ${ORG}. By creating an account you agree to them.</p>

<h2>Your account</h2>
<ul>
  <li>You sign in with your own mobile number and keep your device secure. You are responsible for activity on your account.</li>
  <li>One account per person. Sharing an account, or sharing course content with people who are not enrolled, is not permitted.</li>
</ul>

<h2>Enrolment and fees</h2>
<ul>
  <li>Course fees and enrolment are arranged with the academy. Access to a course opens once the academy has enrolled you in a batch.</li>
  <li>Fees, refunds and cancellations are governed by the academy's fee policy given to you at admission. Nothing in the app changes that policy.</li>
</ul>

<h2>Course content</h2>
<ul>
  <li>Videos, notes, tests and other materials are the property of ${ORG} or its licensors and are provided for your personal study only.</li>
  <li>You may not download (except where the app provides a download), copy, record, share, sell or publish course content.</li>
  <li>We may add, update or withdraw content as the syllabus and courses change.</li>
</ul>

<h2>Tests and conduct</h2>
<ul>
  <li>Tests in the app are sat once, under the conditions shown before you start. Leaving or minimising the app during a test may end it.</li>
  <li>Be respectful in doubts, activities, feedback and live classes. We may suspend accounts used to harass others or to cheat.</li>
</ul>

<h2>Availability</h2>
<p>We aim to keep the app available at all times but cannot guarantee it. Content delivered through third-party services (video hosting, live classes) depends on those services.</p>

<h2>Liability</h2>
<p>The app supports your preparation; it does not guarantee any examination result. To the extent permitted by law, ${ORG} is not liable for indirect or consequential loss arising from use of the app.</p>

<h2>Ending your use</h2>
<p>You may delete your account at any time from the app. We may suspend or end access for breach of these terms.</p>

<h2>Law</h2>
<p>These terms are governed by the laws of India. Courts in Ernakulam, Kerala have jurisdiction.</p>

<h2>Contact</h2>
<p>${ORG}<br>${ADDRESS}<br>${EMAIL}<br>${PHONE}</p>
`;

const DELETE = `
<p>You can delete your Inspiro account yourself, from inside the app:</p>
<ol>
  <li>Open the app and go to <strong>Profile</strong> (the last tab).</li>
  <li>Tap <strong>Delete my account</strong>.</li>
  <li>Confirm. Deletion is immediate and cannot be undone.</li>
</ol>
<p>If you cannot open the app, email <a href="mailto:${EMAIL}">${EMAIL}</a> from any address, quoting the mobile number on the account. We will confirm by calling that number before deleting, and complete the request within 7 days.</p>

<h2>What is deleted</h2>
<ul>
  <li>Your name, mobile number, email and profile photo.</li>
  <li>Your sign-in sessions and notification token, so no further notifications are sent.</li>
  <li>Your learning data: watch progress, test attempts, doubts, activity submissions, feedback, streaks and leaderboard entries.</li>
  <li>Your enrolments, so the account can no longer open any course.</li>
</ul>

<h2>What is kept</h2>
<p>Admission and fee records are retained for as long as Indian accounting law requires, because they are the academy's financial records. They are kept against an anonymised entry — your name and number are removed from them.</p>

<h2>After deletion</h2>
<p>If you sign in again later with the same mobile number, a brand-new account is created. Nothing from the deleted account is restored.</p>

<p>${ORG} · ${EMAIL} · ${PHONE}</p>
`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Inspiro IAS Academy</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;background:#fff;color:#16202E;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  main{max-width:720px;margin:0 auto;padding:32px 22px 64px}
  h1{font-size:26px;margin:0 0 6px}h2{font-size:18px;margin:28px 0 8px}
  p,li{color:#3C4A5C}ul,ol{padding-left:22px}li{margin:6px 0}
  .muted{color:#6B7787;font-size:14px}a{color:#1F5C8B}
  .org{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6B7787;margin-bottom:18px}
  @media(prefers-color-scheme:dark){body{background:#101720;color:#E6EBF2}p,li{color:#BAC5D3}.muted,.org{color:#8A97A8}a{color:#74AAD2}}
</style></head><body><main><div class="org">${ORG}</div><h1>${title}</h1>${body}</main></body></html>`;
}
