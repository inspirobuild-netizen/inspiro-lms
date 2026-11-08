// Backend end-to-end of the student journey against the compiled production
// services, exactly as the app and admin panel call them:
//   sign-up -> profile -> catalogue -> request to enrol -> admin approves ->
//   course, lessons, video/PDF/YouTube -> progress -> exam start/submit/result
//   -> AI doubt -> streak/leaderboard. Creates one throwaway student; removes it.
// Run inside inspiro-api:  node /app/e2e-student.mjs
import pg from 'pg';
import { updateMyProfile, getMyProfile } from './dist/src/modules/users/users.service.js';
import { listCourses, getCourseDetail, getModuleLessons, getLessonWatchUrl, getLessonFileName, updateProgress, getMyCourseProgress } from './dist/src/modules/courses/courses.service.js';
import { requestEnrolment, listMyEnrollRequests, listEnrollRequests, verifyEnrollRequest } from './dist/src/modules/enrollment/enrollment.service.js';
import { listAvailableExams, startExam, submitExam, getExamResult, getMyAttempts } from './dist/src/modules/exams/exams.service.js';
import { createDoubt, listMyDoubts } from './dist/src/modules/doubts/doubts.service.js';
import { getUserStreak, getGlobalLeaderboard } from './dist/src/modules/leaderboard/leaderboard.service.js';

const COURSE = '43a47f5a-3abe-4298-8b50-d92c07984dce'; // Junior IAS Stream 1 (fee 5000)
const BATCH = '5669eb83-030e-407f-bfcc-704a28be138a';  // batch 001
const MODULE = '7e21ff6d-00b4-409f-9072-44ef316ce904'; // Class 1
const LESSON_VIDEO = '60100d75-8617-4fa6-9e97-5fc0517dbac6';
const LESSON_PDF = 'd1321edd-48ed-42b0-a952-f53e1ba3b671';
const LESSON_YT = 'a9eac72b-dcaf-4884-933b-b06730139485';
const EXAM = '09178b2e-90df-47e9-8fbe-aa592615f357';   // Class 1 Weekly Test, 3 questions

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };
const data = (r) => (r && r.data !== undefined ? r.data : r);

const [admin] = await q(`select id from users where role='admin' and is_active limit 1`);
const tag = Date.now().toString().slice(-9);
const phone = '+9190' + tag;
// 1. sign-up: Firebase sign-in inserts the user exactly like this
const [student] = await q(`insert into users (phone, name, role) values ($1, 'New User', 'student') returning id`, [phone]);
const S = student.id;
console.log(`student ${S} phone ${phone}`);

try {
  // 2. profile setup
  await updateMyProfile(S, { name: 'E2E Tablet Student', targetExam: 'upsc' });
  const me = data(await getMyProfile(S));
  check('profile saved (name, UPSC)', me.name === 'E2E Tablet Student' && me.targetExam === 'upsc', JSON.stringify({ name: me.name, exam: me.targetExam }));

  // 3. catalogue
  const cat = data(await listCourses({ page: 1, limit: 50, scope: 'catalog' }, S, 'student'));
  const catList = Array.isArray(cat) ? cat : (cat.items ?? cat.courses ?? cat.data ?? []);
  const course = catList.find((x) => x.id === COURSE);
  check('catalogue lists Junior IAS Stream 1 (published)', !!course, `${catList.length} courses: ${catList.map((x) => x.title).join(' | ')}`);
  check('catalogue hides unpublished courses', !catList.some((x) => x.isPublished === false), '');
  let beforeCode = 'opened';
  try { await getCourseDetail(COURSE, S, 'student'); } catch (e) { beforeCode = e.code; }
  check('course content is refused before enrolment (NOT_ENROLLED)', beforeCode === 'NOT_ENROLLED', beforeCode);

  // 4. request to enrol (the app's "Request to enrol" button)
  const req = await requestEnrolment(S, COURSE);
  check('request created: pending, fee 5000, no reference', req.status === 'pending' && req.amount === 5000 && !req.reference, JSON.stringify({ status: req.status, amount: req.amount, method: req.method, channel: req.channel }));
  const mine = await listMyEnrollRequests(S);
  check('student sees "Request sent" (pending, manual channel)', mine.some((r) => r.id === req.id && r.status === 'pending' && r.channel === 'manual'));
  const adminList = data(await listEnrollRequests('pending'));
  const adminRows = Array.isArray(adminList) ? adminList : (adminList.items ?? []);
  check('admin "Enrolment requests" shows it as pending', adminRows.some((r) => r.id === req.id), `${adminRows.length} pending in total`);

  // 5. admin approves into batch 001 (the "Approve and enrol" modal)
  const v = await verifyEnrollRequest(req.id, { batchId: BATCH }, admin.id, 'admin');
  check('admin approval without payment reference succeeds', !!v.admissionId);
  const [enr] = await q(`select status::text from batch_enrollments where user_id=$1 and batch_id=$2`, [S, BATCH]);
  check('student is active in batch 001', enr?.status === 'active', enr?.status);
  const [adm] = await q(`select fee_amount, amount_paid, payment_status::text from admissions where id=$1`, [v.admissionId]);
  check('admission: fee 5000 due at the office, nothing paid', adm.fee_amount === 5000 && adm.amount_paid === 0 && adm.payment_status === 'pending', JSON.stringify(adm));
  const [notif] = await q(`select title, body from notifications where user_id=$1 order by created_at desc limit 1`, [S]);
  check('student notified "You are enrolled"', /enrolled/i.test(notif?.title ?? ''), notif?.title);
  const mine2 = await listMyEnrollRequests(S);
  check('request now shows verified', mine2.some((r) => r.id === req.id && r.status === 'verified'), mine2.map((r) => r.status).join(','));

  // 6. class view
  const prog = data(await getMyCourseProgress(S));
  const progList = Array.isArray(prog) ? prog : (prog.items ?? prog.courses ?? []);
  check('Learn tab lists the enrolled course', progList.some((x) => (x.courseId ?? x.id) === COURSE), JSON.stringify(progList.map((x) => x.title ?? x.courseTitle)));
  const detail = data(await getCourseDetail(COURSE, S, 'student'));
  check('course detail opens after enrolment, module Class 1 visible', (detail.modules ?? []).some((m) => m.id === MODULE), JSON.stringify({ modules: (detail.modules ?? []).map((m) => m.title) }));
  const lessons = data(await getModuleLessons(MODULE, S, 'student'));
  const lessonList = Array.isArray(lessons) ? lessons : (lessons.items ?? lessons.lessons ?? []);
  check('Class 1 has its 3 lessons (academy video, PDF note, YouTube video)', lessonList.length === 3, lessonList.map((l) => `${l.title} [${l.type}/${l.videoProvider ?? ''}]`).join(' | '));

  const w = await getLessonWatchUrl(LESSON_VIDEO, S, 'student');
  check('academy video: signed Bunny URL issued', w.provider === 'bunny' && /^https:\/\/.*b-cdn\.net\//.test(w.url ?? ''), (w.url ?? '').replace(/token=[^&]+/, 'token=…').slice(0, 110));
  const vres = await fetch(w.url).catch((e) => ({ status: 'ERR ' + e.message }));
  check('academy video URL plays (CDN answers 200)', vres.status === 200, `HTTP ${vres.status}`);
  const y = await getLessonWatchUrl(LESSON_YT, S, 'student');
  check('YouTube lesson returns its video id', y.provider === 'youtube' && y.youtubeVideoId === 'rsi-H1GCBhs', JSON.stringify(y));
  const p = await getLessonWatchUrl(LESSON_PDF, S, 'student');
  const fname = await getLessonFileName(LESSON_PDF, S, 'student');
  check('PDF note: file route + stored file name', p.type === 'pdf' && /\/lessons\/.*\/file$/.test(p.url) && !!fname, `${p.url} -> ${fname}`);
  const fs = await import('node:fs');
  const candidates = ['/app/uploads/docs/' + fname];
  const found = candidates.find((f) => fs.existsSync(f));
  check('PDF file exists on the server', !!found, found ?? `not at ${candidates.join(', ')}`);

  await updateProgress(LESSON_VIDEO, S, { watchedSeconds: 125, isCompleted: false });
  await updateProgress(LESSON_PDF, S, { watchedSeconds: 0, isCompleted: true });
  const [lp] = await q(`select count(*)::int n from lesson_progress where user_id=$1`, [S]);
  check('watch progress saved for 2 lessons', lp.n === 2, `${lp.n} rows`);
  const prog2 = data(await getMyCourseProgress(S));
  const pc = (Array.isArray(prog2) ? prog2 : (prog2.items ?? prog2.courses ?? [])).find((x) => (x.courseId ?? x.id) === COURSE);
  check('course progress reflects the completed lesson', (pc?.completedLessons ?? pc?.completed ?? 0) >= 1 || (pc?.progressPercent ?? pc?.progress ?? 0) > 0, JSON.stringify(pc));

  // 7. exam
  const avail = data(await listAvailableExams(S, { page: 1, limit: 20 }));
  const availList = Array.isArray(avail) ? avail : (avail.items ?? avail.exams ?? []);
  check('Exams tab lists "Class 1 Weekly Test" for batch 001', availList.some((e) => e.id === EXAM), availList.map((e) => e.title).join(' | '));
  const started = data(await startExam(EXAM, S));
  const attemptId = started.attemptId ?? started.attempt?.id ?? started.id;
  const qs = started.questions ?? [];
  check('exam starts: attempt + 3 questions, answers hidden', !!attemptId && qs.length === 3 && qs.every((x) => x.correctIndex === undefined), JSON.stringify({ attemptId, n: qs.length, keys: Object.keys(qs[0] ?? {}) }));
  const truth = await q(`select id, correct_index from questions where exam_id=$1`, [EXAM]);
  const [ex] = await q(`select marks_per_question, neg_marks, pass_percent from exams where id=$1`, [EXAM]);
  const answers = {};
  qs.forEach((x, i) => { const t = truth.find((r) => r.id === x.id); answers[x.id] = i < 2 ? t.correct_index : (t.correct_index + 1) % 4; });
  const sub = data(await submitExam(EXAM, attemptId, S, { answers, isAutoSubmitted: false, tabSwitchCount: 0 }));
  const expected = Math.max(0, 2 * Number(ex.marks_per_question) - 1 * Number(ex.neg_marks));
  check('submit: 2 right + 1 wrong scored by the marking scheme', Number(sub.score) === expected, JSON.stringify({ score: sub.score, maxScore: sub.maxScore, expected, percentage: sub.percentage, passed: sub.passed }));
  const result = data(await getExamResult(EXAM, S));
  check('result screen: score, percentage and pass flag', result && Number(result.score ?? result.attempt?.score) === expected && typeof (result.passed ?? result.attempt?.passed) === 'boolean', JSON.stringify(result).slice(0, 200));
  const att = data(await getMyAttempts(S, 1, 10));
  const attList = Array.isArray(att) ? att : (att.items ?? att.attempts ?? []);
  check('Attended tab lists the attempt', attList.some((a) => a.examId === EXAM || a.exam?.id === EXAM), `${attList.length} attempts`);

  // 8. AI doubt
  const d = data(await createDoubt(S, { requestedRoute: 'ai', subject: 'Polity', body: 'What does Article 21 of the Constitution guarantee?' }));
  check('AI doubt answered instantly', d.status === 'ai_answered' && (d.aiAnswer ?? d.answer ?? '').length > 40, JSON.stringify({ status: d.status, answer: (d.aiAnswer ?? d.answer ?? '').slice(0, 80) }));
  const myD = data(await listMyDoubts(S, { page: 1, limit: 10 }));
  check('Doubts list shows it', (Array.isArray(myD) ? myD : (myD.items ?? [])).length === 1);

  // 9. streak / leaderboard
  const streak = data(await getUserStreak(S));
  check('streak counted after studying', (streak?.currentStreak ?? streak?.streak ?? 0) >= 1 || (streak?.xp ?? streak?.totalXp ?? 0) > 0, JSON.stringify(streak));
  const lb = data(await getGlobalLeaderboard(1, 50, S));
  check('global leaderboard responds', !!lb, JSON.stringify(lb).slice(0, 80));
} catch (e) {
  fail++; console.log('FAIL unexpected error:', e.message, e.code ?? '', (e.stack ?? '').split('\n')[1] ?? '');
} finally {
  const leads = await q(`select lead_id from enrollment_requests where student_id=$1`, [S]);
  const admIds = await q(`select id from admissions where student_id=$1`, [S]);
  for (const t of [
    ['exam_attempts', 'student_id'], ['lesson_progress', 'user_id'], ['doubts', 'student_id'], ['leaderboard', 'student_id'], ['streaks', 'user_id'],
    ['activity_submissions', 'student_id'], ['notifications', 'user_id'], ['batch_enrollments', 'user_id'],
  ]) await q(`delete from ${t[0]} where ${t[1]}=$1`, [S]).catch((e) => console.log(`cleanup ${t[0]}: ${e.message.slice(0, 60)}`));
  for (const a of admIds) await q(`delete from payments where admission_id=$1`, [a.id]).catch(() => {});
  await q(`delete from admissions where student_id=$1`, [S]).catch((e) => console.log('cleanup admissions:', e.message.slice(0, 60)));
  await q(`delete from enrollment_requests where student_id=$1`, [S]).catch((e) => console.log('cleanup requests:', e.message.slice(0, 60)));
  for (const l of leads) if (l.lead_id) await q(`delete from leads where id=$1`, [l.lead_id]).catch((e) => console.log('cleanup lead:', e.message.slice(0, 60)));
  await q(`delete from users where id=$1`, [S]).catch((e) => console.log('cleanup user:', e.message.slice(0, 60)));
  const [{ left }] = await q(`select count(*)::int as left from users where id=$1`, [S]);
  console.log(`cleanup: test student rows left = ${left}`);
  await c.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
