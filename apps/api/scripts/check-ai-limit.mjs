// The daily limit on AI doubt answers, and the current-affairs schedule, against production.
// Creates one throwaway student with seeded doubts and removes them. Makes at most one real AI
// call (pass --no-ai to skip it). Changes no settings.
// Run in a one-off api container (see HANDOVER.md):  node --no-warnings /app/x.mjs
import pg from 'pg';
import { createDoubt, aiAnswerQuota } from './dist/src/modules/doubts/doubts.service.js';
import { getSetting, getSettings } from './dist/src/modules/settings/settings.service.js';
import { getIngestionStatus, ingestCurrentAffairsIfDue } from './dist/src/modules/current-affairs/current-affairs.service.js';
import { redis } from './dist/src/lib/redis.js';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const settings = await getSettings();
const limit = await getSetting('aiDoubtsDailyLimit');
check('the daily limit is a number from 1 to 100', Number.isInteger(limit) && limit >= 1 && limit <= 100, `limit ${limit}; AI doubts enabled: ${settings.aiDoubtsEnabled}`);

const [student] = await q(`insert into users (phone, name, role) values ($1, 'ZZ AI Limit', 'student') returning id`, ['+9192' + Date.now().toString().slice(-8)]);
const S = student.id;
try {
  let quota = await aiAnswerQuota(S);
  check('a new student has the whole day left', quota.used === 0 && quota.left === limit, JSON.stringify(quota));

  for (let i = 0; i < limit; i++) {
    await q(`insert into doubts (student_id, subject, body, requested_route, ai_answer, ai_confidence, status) values ($1, 'ZZ', 'ZZ seeded', 'ai', 'ZZ', 0.9, 'ai_answered')`, [S]);
  }
  await q(`insert into doubts (student_id, subject, body, requested_route, ai_answer, status, created_at) values ($1, 'ZZ', 'ZZ yesterday', 'ai', 'ZZ', 'ai_answered', now() - interval '26 hours')`, [S]);
  await q(`insert into doubts (student_id, subject, body, requested_route, status) values ($1, 'ZZ', 'ZZ to mentor', 'mentor', 'escalated')`, [S]);
  quota = await aiAnswerQuota(S);
  check(`${limit} AI answers today use up the day; yesterday's and mentor doubts do not count`, quota.used === limit && quota.left === 0, JSON.stringify(quota));

  if (settings.aiDoubtsEnabled) {
    const over = await createDoubt(S, { subject: 'Polity', body: 'ZZ limit check: what is Article 14?', requestedRoute: 'ai', language: 'en' });
    check('past the limit an AI doubt is accepted and goes to a mentor, unanswered by the AI',
      over.status === 'escalated' && over.aiAnswer === null && over.aiLimitReached === true, `status ${over.status}; notice: ${over.notice}`);
  } else {
    console.log('     (AI doubts are switched off by the academy: every doubt already goes to a mentor)');
  }
  const mentor = await createDoubt(S, { subject: 'Polity', body: 'ZZ limit check: mentor route', requestedRoute: 'mentor', language: 'en' });
  check('a mentor doubt is unaffected by the limit', mentor.status === 'escalated' && !mentor.aiLimitReached);

  if (settings.aiDoubtsEnabled && !process.argv.includes('--no-ai')) {
    await q(`delete from doubts where id = (select id from doubts where student_id=$1 and body='ZZ seeded' limit 1)`, [S]);
    const t0 = Date.now();
    const d = await createDoubt(S, { subject: 'Polity', body: 'Who is the current Vice-President of India?', requestedRoute: 'ai', language: 'en' });
    check('with one answer left, the AI answers', d.aiAnswer !== null && !d.aiLimitReached,
      `${((Date.now() - t0) / 1000).toFixed(1)}s, status ${d.status}, confidence ${d.aiConfidence}: ${(d.aiAnswer ?? '').replace(/\n/g, ' ').slice(0, 170)}`);
    quota = await aiAnswerQuota(S);
    check('and that answer uses the last one', quota.left === 0, JSON.stringify(quota));
  }

  const status = await getIngestionStatus();
  check('current affairs: today has its articles', status.addedToday >= status.dailyTarget, `${status.addedToday} today, target ${status.dailyTarget}, newest ${status.newestAt?.toISOString?.() ?? status.newestAt}`);
  const due = await ingestCurrentAffairsIfDue();
  check('the hourly job does nothing once today is done', status.addedToday < status.dailyTarget || due.due === false, JSON.stringify(due));
} finally {
  await q(`delete from users where id=$1`, [S]).catch((e) => console.log('cleanup:', e.message.slice(0, 60)));
  const [n] = await q(`select (select count(*) from users where id=$1)::int + (select count(*) from doubts where student_id=$1)::int n`, [S]);
  console.log(`cleanup: throwaway rows left = ${n.n}`);
  await c.end(); await redis.quit().catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
