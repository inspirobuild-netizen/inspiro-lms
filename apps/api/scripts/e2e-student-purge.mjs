// Permanent student deletion, end to end against the compiled services:
// builds a throwaway student with a lead, an admission with instalments and a
// confirmed payment, an enrolment, a test attempt, progress and a doubt; checks
// the impact preview, the confirmed-payment guard, the deletion itself, that
// no row is left anywhere, and that the number can sign up again.
// Run inside an api container:  node --no-warnings /app/e2e-student-purge.mjs
import pg from 'pg';
import { studentDeletionImpact, deleteStudentPermanently } from './dist/src/modules/users/student-purge.service.js';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const tag = Date.now().toString().slice(-8);
const phone = `+9199${tag}`;
const BATCH = '5669eb83-030e-407f-bfcc-704a28be138a';
const COURSE = '43a47f5a-3abe-4298-8b50-d92c07984dce';
const EXAM = '09178b2e-90df-47e9-8fbe-aa592615f357';
const LESSON = '60100d75-8617-4fa6-9e97-5fc0517dbac6';
let S = null;

try {
  const [admin] = await q(`select id from users where role='admin' and is_active limit 1`);
  [{ id: S }] = await q(`insert into users (phone, name, role) values ($1, 'ZZ Purge Test', 'student') returning id`, [phone]);
  const [lead] = await q(`insert into leads (lead_code, student_name, phone, source, priority, status) values ($1, 'ZZ Purge Test', $2, 'mobile_app', 'warm', 'new') returning id`, [`ZZTEST-${tag}`, phone.slice(3)]);
  const [adm] = await q(`insert into admissions (admission_no, student_id, counsellor_id, course_id, batch_id, admission_date, fee_amount, amount_paid, payment_status, lead_id)
                         values ($1, $2, $3, $4, $5, current_date, 5000, 2000, 'partial', $6) returning id`, [`ZZ-${tag}`, S, admin.id, COURSE, BATCH, lead.id]);
  await q(`insert into admission_installments (admission_id, seq, label, amount, paid_amount, due_date, status) values ($1, 1, 'First', 2000, 2000, current_date, 'paid'), ($1, 2, 'Second', 3000, 0, current_date + 30, 'pending')`, [adm.id]);
  await q(`insert into payments (admission_id, amount, method, status, collected_by, verified_by, verified_at) values ($1, 2000, 'cash', 'verified', $2, $2, now())`, [adm.id, admin.id]);
  await q(`insert into batch_enrollments (user_id, batch_id, status) values ($1, $2, 'active')`, [S, BATCH]);
  await q(`insert into exam_attempts (exam_id, student_id, score, max_score, submitted_at) values ($1, $2, 1, 3, now())`, [EXAM, S]);
  await q(`insert into lesson_progress (user_id, lesson_id, watched_seconds) values ($1, $2, 60)`, [S, LESSON]);
  await q(`insert into doubts (student_id, subject, body, status) values ($1, 'Polity', 'ZZ purge test doubt', 'open')`, [S]);
  await q(`insert into notifications (user_id, title, body, type) values ($1, 'ZZ', 'ZZ', 'achievement')`, [S]);

  const im = await studentDeletionImpact(S);
  check('impact preview counts everything', im.admissions.length === 1 && im.confirmedPaid === 2000 && im.paymentEntries === 1 && im.leads === 1
    && im.enrolments === 1 && im.testAttempts === 1 && im.doubts === 1 && im.lessonsWatched === 1, JSON.stringify(im));

  let code = 'no error';
  try { await deleteStudentPermanently(S); } catch (e) { code = e.code; }
  check('refused without acknowledging ₹2000 of confirmed payments', code === 'HAS_CONFIRMED_PAYMENTS', code);
  const [{ still }] = await q(`select count(*)::int still from users where id=$1`, [S]);
  check('nothing deleted by the refused attempt', still === 1);

  await deleteStudentPermanently(S, { confirmPaid: true });
  const left = await q(`select
      (select count(*) from users where id=$1)::int u,
      (select count(*) from admissions where student_id=$1)::int a,
      (select count(*) from admission_installments where admission_id=$2)::int i,
      (select count(*) from payments where admission_id=$2)::int p,
      (select count(*) from leads where id=$3)::int l,
      (select count(*) from batch_enrollments where user_id=$1)::int e,
      (select count(*) from exam_attempts where student_id=$1)::int x,
      (select count(*) from lesson_progress where user_id=$1)::int g,
      (select count(*) from doubts where student_id=$1)::int d,
      (select count(*) from notifications where user_id=$1)::int n`, [S, adm.id, lead.id]);
  const total = Object.values(left[0]).reduce((s, v) => s + v, 0);
  check('no row left in users, admissions, instalments, payments, leads, enrolments, attempts, progress, doubts, notifications', total === 0, JSON.stringify(left[0]));

  const [again] = await q(`insert into users (phone, name, role) values ($1, 'ZZ Purge Test again', 'student') returning id`, [phone]);
  check('the same number signs up again as a new account', !!again?.id);
  await q(`delete from users where id=$1`, [again.id]);
  S = null;

  let staffCode = 'no error';
  const [staff] = await q(`select id from users where role='staff' limit 1`);
  try { await deleteStudentPermanently(staff.id, { confirmPaid: true }); } catch (e) { staffCode = e.code; }
  check('staff accounts are refused', staffCode === 'NOT_A_STUDENT', staffCode);
} catch (e) {
  fail++; console.log('FAIL unexpected error:', e.message, e.code ?? '');
} finally {
  if (S) {
    await q(`delete from leads where lead_code=$1`, [`ZZTEST-${tag}`]).catch(() => {});
    await q(`delete from admissions where student_id=$1`, [S]).catch(() => {});
    await q(`delete from users where id=$1`, [S]).catch(() => {});
  }
  const [{ n }] = await q(`select count(*)::int n from users where name like 'ZZ Purge Test%'`);
  console.log(`cleanup: leftover test users = ${n}`);
  await c.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
