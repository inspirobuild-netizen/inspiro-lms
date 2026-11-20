// One official attempt per exam: a submitted test cannot be started or submitted again (practice
// tests keep their own limit), an unfinished attempt can be resumed, and staff cannot raise the
// limit on a non-practice test. Creates one throwaway student and two throwaway exams in batch
// 001, and removes them. Submitting recomputes batch 001's leaderboard, as any real submit does.
// Run in a one-off api container (see HANDOVER.md):  node --no-warnings /app/x.mjs
import pg from 'pg';
import {
  createExam, updateExam, addQuestion, publishExam, deleteExam,
  listAvailableExams, startExam, submitExam,
} from './dist/src/modules/exams/exams.service.js';

const BATCH = '5669eb83-030e-407f-bfcc-704a28be138a'; // batch 001
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };
const code = async (fn) => { try { await fn(); return 'no error'; } catch (e) { return e.code ?? e.message; } };
const row = async (examId) => (await listAvailableExams(S, { page: 1, limit: 100 })).items.find((e) => e.id === examId);

const [admin] = await q(`select id from users where role='admin' and is_active limit 1`);
const [student] = await q(`insert into users (phone, name, role) values ($1, 'ZZ One Attempt', 'student') returning id`, ['+9191' + Date.now().toString().slice(-8)]);
const S = student.id;
await q(`insert into batch_enrollments (user_id, batch_id, status) values ($1, $2, 'active')`, [S, BATCH]);
const made = [];
try {
  const test = await createExam({ title: 'ZZ one attempt', subject: 'ZZ', type: 'chapter', durationMins: 5, marksPerQuestion: 1, negMarks: 0, passPercent: 40, maxAttempts: 10, batchIds: [BATCH] }, admin.id);
  made.push(test.id);
  check('a chapter test is stored with one attempt, though 10 was sent', test.maxAttempts === 1, `maxAttempts=${test.maxAttempts}`);
  const raised = await updateExam(test.id, { maxAttempts: 5 });
  check('staff cannot raise it later', raised.maxAttempts === 1, `maxAttempts=${raised.maxAttempts}`);
  const qn = await addQuestion(test.id, { body: 'ZZ?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, subject: 'ZZ', difficulty: 'easy' });
  await publishExam(test.id);

  let r = await row(test.id);
  check('listed as new: can attempt, nothing in progress', r?.canAttempt === true && r?.inProgress === false);
  const first = await startExam(test.id, S);
  const again = await startExam(test.id, S);
  check('an unfinished attempt is resumed, not refused', again.resumed === true && again.attempt.id === first.attempt.id);
  r = await row(test.id);
  check('listed as in progress while unfinished', r?.inProgress === true && r?.canAttempt === true);
  await submitExam(test.id, first.attempt.id, S, { answers: { [qn.id]: 0 }, isAutoSubmitted: false, tabSwitchCount: 0 });
  r = await row(test.id);
  check('after submitting: listed as done (cannot attempt)', r?.canAttempt === false && r?.submittedAttempts === 1, JSON.stringify({ canAttempt: r?.canAttempt, submitted: r?.submittedAttempts }));
  check('starting it again is refused', (await code(() => startExam(test.id, S))) === 'ATTEMPT_LIMIT_REACHED');
  const [stale] = await q(`insert into exam_attempts (exam_id, student_id, max_score) values ($1, $2, 0) returning id`, [test.id, S]);
  check('an attempt left open from before is not resumed for a retake', (await code(() => startExam(test.id, S))) === 'ATTEMPT_LIMIT_REACHED');
  check('nor can it be submitted as a second result', (await code(() => submitExam(test.id, stale.id, S, { answers: { [qn.id]: 1 }, isAutoSubmitted: false, tabSwitchCount: 0 }))) === 'ALREADY_SUBMITTED');

  const practice = await createExam({ title: 'ZZ practice', subject: 'ZZ', type: 'practice', durationMins: 5, marksPerQuestion: 1, negMarks: 0, passPercent: 40, maxAttempts: 2 }, admin.id);
  made.push(practice.id);
  const pq = await addQuestion(practice.id, { body: 'ZZ?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, subject: 'ZZ', difficulty: 'easy' });
  await publishExam(practice.id);
  for (let i = 1; i <= 2; i++) {
    const a = await startExam(practice.id, S);
    await submitExam(practice.id, a.attempt.id, S, { answers: { [pq.id]: 0 }, isAutoSubmitted: false, tabSwitchCount: 0 });
  }
  check('a practice test keeps its own limit: two submitted', (await row(practice.id))?.submittedAttempts === 2);
  check('and the third start is refused', (await code(() => startExam(practice.id, S))) === 'ATTEMPT_LIMIT_REACHED');
} finally {
  for (const id of made) await deleteExam(id).catch((e) => console.log('cleanup exam:', e.message.slice(0, 60)));
  await q(`delete from questions where subject = 'ZZ' and exam_id is null`).catch(() => {});
  await q(`delete from users where id = $1`, [S]).catch((e) => console.log('cleanup user:', e.message.slice(0, 60)));
  const left = (await q(`select (select count(*) from users where id=$1)::int + (select count(*) from exams where title like 'ZZ %')::int n`, [S]))[0].n;
  console.log(`cleanup: throwaway rows left = ${left}`);
  await c.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
