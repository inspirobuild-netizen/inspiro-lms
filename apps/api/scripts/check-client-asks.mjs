// Checks for the 19 Nov client questions, read-only except one throwaway exam:
//  - the students list reports who has used the app (and the filter works)
//  - a non-practice test with no batch cannot be published; with a batch it can
//  - deleting a test removes it
// Run inside an api container:  node --no-warnings /app/check-client-asks.mjs
import pg from 'pg';
import { listUsers } from './dist/src/modules/users/users.service.js';
import { createExam, addQuestion, publishExam, updateExam, deleteExam } from './dist/src/modules/exams/exams.service.js';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };
const code = async (fn) => { try { await fn(); return 'no error'; } catch (e) { return e.code ?? e.message; } };

const all = await listUsers({ page: 1, limit: 100, role: 'student' });
const used = await listUsers({ page: 1, limit: 100, role: 'student', appStatus: 'signed_in' });
const never = await listUsers({ page: 1, limit: 100, role: 'student', appStatus: 'never' });
check('students list carries lastActiveAt and appDevices', all.items.every((u) => 'lastActiveAt' in u && Array.isArray(u.appDevices)));
check('"using the app" + "never signed in" add up to all students', used.total + never.total === all.total, `${used.total} + ${never.total} = ${all.total}`);
check('the filter and the column agree (every "using the app" row has a last-active date)', used.items.every((u) => u.lastActiveAt) && never.items.every((u) => !u.lastActiveAt));
for (const u of all.items.slice(0, 6)) console.log(`     ${u.name.padEnd(24)} ${u.lastActiveAt ? new Date(u.lastActiveAt).toISOString().slice(0, 10) : 'never'.padEnd(10)} ${u.appDevices.join('+')}`);

const [admin] = (await c.query(`select id from users where role='admin' and is_active limit 1`)).rows;
const BATCH = '5669eb83-030e-407f-bfcc-704a28be138a';
const ex = await createExam({ title: 'ZZ audience check', subject: 'ZZ', type: 'chapter', durationMins: 5, marksPerQuestion: 1, negMarks: 0, passPercent: 40, maxAttempts: 1 }, admin.id);
try {
  await addQuestion(ex.id, { body: 'ZZ?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, subject: 'ZZ', difficulty: 'easy' });
  check('a chapter test with no batch cannot be published', (await code(() => publishExam(ex.id))) === 'NO_AUDIENCE');
  await updateExam(ex.id, { batchIds: [BATCH] });
  check('after choosing a batch it publishes', (await code(() => publishExam(ex.id))) === 'no error');
} finally {
  await deleteExam(ex.id);
  const left = (await c.query(`select count(*)::int n from exams where id=$1`, [ex.id])).rows[0].n;
  check('the test is deleted', left === 0);
  await c.query(`delete from questions where exam_id is null and subject='ZZ'`);
}
await c.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
