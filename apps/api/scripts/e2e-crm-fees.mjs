// CRM -> admission -> fees -> finance approval -> reports, against the compiled
// production services with the rules the code promises:
//   fee never typed by staff, payable admission must be paid at conversion,
//   counsellor money is pending until an admin confirms it (maker-checker),
//   rollups count verified money only, installments, overview and CSV totals.
// Creates a throwaway course/batch/plan/lead/student; removes everything.
// Run inside inspiro-api:  node --no-warnings /app/e2e-crm.mjs
import pg from 'pg';
import { createLead, getLead, listLeads, getPipeline, addFollowup, getFollowups, changeStatus, convertLead } from './dist/src/modules/leads/leads.service.js';
import { createFeePlan, listFeePlans, recordPayment, listPayments, listInstallments, getFeesOverview, getOutstandingInstallments } from './dist/src/modules/fees/fees.service.js';
import { createFeePlanSchema } from './dist/src/modules/fees/fees.schema.js';
import { listApprovals, verifyPayment, rejectPayment, activateEnrollment, counsellorSummary } from './dist/src/modules/finance/finance.service.js';
import { listAdmissions, getAdmissionsSummary, setTarget, getTarget } from './dist/src/modules/admissions/admissions.service.js';
import { getCounsellorDashboard, getCrmOverview, exportRevenueCsv, exportAdmissionsCsv, exportLeadSourceCsv, exportPendingLeadsCsv } from './dist/src/modules/crm/crm.service.js';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };
const data = (r) => (r && r.data !== undefined ? r.data : r);
const code = async (fn) => { try { await fn(); return 'no error'; } catch (e) { return e.code ?? e.message; } };

const [admin] = await q(`select id, name from users where role='admin' and is_active order by created_at limit 1`);
const staff = await q(`select u.id, u.name from users u where u.role='staff' and u.is_active order by u.created_at limit 2`);
const counsellor = staff[0], otherStaff = staff[1];
console.log(`admin: ${admin.name}; counsellor: ${counsellor?.name}; other staff: ${otherStaff?.name}`);
const tag = Date.now().toString().slice(-8);
const ids = { course: null, batch: null, plan: null, lead: null, lead2: null, student: null, admission: null };
const period = new Date().toISOString().slice(0, 7);

try {
  // ── set-up: a paid course with a batch and a 2-instalment plan ──
  const [course] = await q(`insert into courses (title, subject, created_by, is_published, fee_amount) values ($1, 'ZZ', $2, true, 6000) returning id`, [`ZZ TEST CRM course ${tag}`, admin.id]);
  ids.course = course.id;
  const [batch] = await q(`insert into batches (name, course_id, type, target_exam, start_date, end_date, capacity) values ($1, $2, 'offline', 'upsc', current_date, current_date + 120, 2) returning id`, [`ZZ TEST batch ${tag}`, ids.course]);
  ids.batch = batch.id;
  const bad = createFeePlanSchema.safeParse({ name: 'Bad plan', totalAmount: 6000, installments: [{ label: 'A', amount: 3000, dueAfterDays: 0 }, { label: 'B', amount: 2000, dueAfterDays: 30 }] });
  check('fee plan whose instalments do not add up to the total is refused', !bad.success, bad.success ? 'accepted!' : bad.error.issues[0]?.message);
  const plan = await createFeePlan(ids.course, { name: 'Two instalments', totalAmount: 6000, installments: [{ label: 'At admission', amount: 3000, dueAfterDays: 0 }, { label: 'Second instalment', amount: 3000, dueAfterDays: 30 }], isActive: true, sortOrder: 0 });
  ids.plan = plan.id;
  check('fee plan created and listed for the course', (await listFeePlans(ids.course, true)).some((p) => p.id === ids.plan));

  // ── CRM: lead, scoping, follow-up, stages ──
  const lead = await createLead({ studentName: `ZZ Test Lead ${tag}`, phone: `+9188${tag}`, source: 'walk_in', priority: 'hot', courseInterested: 'ZZ TEST CRM course', ownerId: counsellor.id, remarks: 'walked in asking about the course' }, admin.id, counsellor.id);
  ids.lead = lead.id;
  check('lead created with a LEAD code, stage new, owned by the counsellor', /^LEAD-/.test(lead.leadCode) && lead.status === 'new' && lead.ownerId === counsellor.id, `${lead.leadCode} ${lead.status}`);
  const pipeOwn = await getPipeline({ ownerId: counsellor.id, viewAll: false });
  const inPipe = (p) => Object.values(p).flat().some((l) => l.id === ids.lead) || (Array.isArray(p) && p.some((s) => (s.leads ?? []).some((l) => l.id === ids.lead)));
  check('counsellor sees the lead on their pipeline', inPipe(pipeOwn), JSON.stringify(Object.keys(pipeOwn)).slice(0, 80));
  if (otherStaff) {
    const pipeOther = await getPipeline({ ownerId: otherStaff.id, viewAll: false });
    check('another counsellor does NOT see it (own leads only)', !inPipe(pipeOther));
  }
  check('admin sees it with view-all', inPipe(await getPipeline({ ownerId: admin.id, viewAll: true })));
  const otherView = await code(() => getLead(ids.lead, { ownerId: otherStaff?.id ?? admin.id, viewAll: false }));
  check('lead detail is scoped: another counsellor is refused', otherStaff ? otherView !== 'no error' : true, otherView);

  const due = new Date(Date.now() + 2 * 86400_000).toISOString();
  await addFollowup(ids.lead, counsellor.id, { remarks: 'Called, parent will visit on Monday', callSummary: 'interested', nextAction: 'Campus visit', nextFollowupAt: due });
  const fus = await getFollowups(ids.lead);
  const leadAfter = data(await getLead(ids.lead, { ownerId: admin.id, viewAll: true }));
  const nextAt = leadAfter.lead?.nextFollowupAt ?? leadAfter.nextFollowupAt;
  check('follow-up logged and the lead\'s next follow-up date moved', fus.length === 1 && nextAt && Math.abs(new Date(nextAt) - new Date(due)) < 5000, `${fus.length} follow-ups, next ${nextAt}`);
  for (const s of ['contacted', 'counselling', 'fee_discussion']) await changeStatus(ids.lead, s, counsellor.id);
  const hist = await q(`select from_status::text f, to_status::text t from lead_status_history where lead_id=$1 order by created_at`, [ids.lead]);
  check('stage changes recorded in the history (new→contacted→counselling→fee_discussion)', hist.length >= 4 && hist[hist.length - 1].t === 'fee_discussion', hist.map((h) => `${h.f}>${h.t}`).join(' '));

  // ── conversion rules ──
  const noPay = await code(() => convertLead(ids.lead, { batchId: ids.batch, feePlanId: ids.plan, collectMethod: 'cash' }, counsellor.id, 'staff'));
  check('converting a payable lead with no payment is refused', noPay !== 'no error', noPay);
  const oddAmount = await code(() => convertLead(ids.lead, { batchId: ids.batch, feePlanId: ids.plan, collectAmount: 1234, collectMethod: 'cash' }, counsellor.id, 'staff'));
  check('an amount that is not a plan instalment is refused (no free-typed amounts)', oddAmount !== 'no error', oddAmount);
  const tooMuch = await code(() => convertLead(ids.lead, { batchId: ids.batch, feePlanId: ids.plan, collectAmount: 9000, collectMethod: 'cash' }, counsellor.id, 'staff'));
  check('an amount above the fee is refused', tooMuch !== 'no error', tooMuch);

  const conv = await convertLead(ids.lead, { batchId: ids.batch, feePlanId: ids.plan, targetExam: 'upsc', collectAmount: 3000, collectMethod: 'cash' }, counsellor.id, 'staff');
  ids.student = conv.studentId ?? conv.student?.id; ids.admission = conv.admissionId ?? conv.admission?.id;
  const [adm] = await q(`select admission_no, fee_amount, amount_paid, payment_status::text, counsellor_id, course_id, batch_id from admissions where id=$1`, [ids.admission]);
  check('counsellor conversion: admission with ADM code, fee 6000 from the plan, course taken from the batch', /^ADM-/.test(adm.admission_no) && adm.fee_amount === 6000 && adm.course_id === ids.course && adm.counsellor_id === counsellor.id, JSON.stringify(adm));
  const [stu] = await q(`select name, phone, role::text, target_exam::text from users where id=$1`, [ids.student]);
  check('student account created from the lead (phone, UPSC)', stu.role === 'student' && stu.phone === `+9188${tag}` && stu.target_exam === 'upsc', JSON.stringify(stu));
  const [lead2] = await q(`select status::text, converted_student_id from leads where id=$1`, [ids.lead]);
  check('lead marked converted and linked to the student', lead2.status === 'converted' && lead2.converted_student_id === ids.student);
  check('a converted lead can no longer change stage', (await code(() => changeStatus(ids.lead, 'lost', admin.id))) === 'LEAD_CONVERTED');
  const [enr] = await q(`select status::text from batch_enrollments where user_id=$1 and batch_id=$2`, [ids.student, ids.batch]);
  check('MAKER-CHECKER: enrolment waits for admin approval', enr?.status === 'pending_approval', enr?.status);
  const pays = await listPayments(ids.admission);
  check('MAKER-CHECKER: the counsellor\'s ₹3000 cash entry is pending, not counted yet', pays.length === 1 && pays[0].status === 'pending' && adm.amount_paid === 0 && adm.payment_status === 'pending', JSON.stringify(pays.map((p) => [p.amount, p.status])));
  const insts = await listInstallments(ids.admission);
  check('two instalments materialised (3000 due now, 3000 in 30 days), both pending', insts.length === 2 && insts.every((i) => i.status === 'pending') && insts.map((i) => Number(i.amount)).join('+') === '3000+3000', JSON.stringify(insts.map((i) => [i.label, i.amount, String(i.dueDate).slice(0, 10), i.status])));

  // ── finance approvals (admin) ──
  const approvals = await listApprovals();
  const mine = approvals.find((a) => a.admissionId === ids.admission || a.admission?.id === ids.admission || a.studentId === ids.student);
  check('Finance approvals lists this admission (pending payment + pending enrolment)', !!mine, JSON.stringify(mine ?? approvals[0] ?? {}).slice(0, 220));
  const v = await verifyPayment(pays[0].id, admin.id);
  const [adm2] = await q(`select amount_paid, payment_status::text from admissions where id=$1`, [ids.admission]);
  check('admin confirms the cash: amountPaid 3000, status partial, first instalment paid', v.amountPaid === 3000 && adm2.payment_status === 'partial' && (await listInstallments(ids.admission)).filter((i) => i.status === 'paid').length === 1, JSON.stringify({ ...v, status: adm2.payment_status }));
  check('confirming twice is refused', (await code(() => verifyPayment(pays[0].id, admin.id))) === 'ALREADY_REVIEWED');
  const enrolRow = await q(`select id from batch_enrollments where user_id=$1 and batch_id=$2`, [ids.student, ids.batch]);
  await activateEnrollment(enrolRow[0].id);
  const [enr2] = await q(`select status::text from batch_enrollments where id=$1`, [enrolRow[0].id]);
  check('admin activates the enrolment → student gets class access', enr2.status === 'active');

  // a counsellor claim that the admin rejects must not touch the rollup
  const claim = await recordPayment(ids.admission, { amount: 1000, method: 'upi', reference: 'ZZ-fake-ref' }, counsellor.id, 'staff');
  const claimId = claim.paymentId ?? claim.id ?? claim.payment?.id;
  await rejectPayment(claimId, admin.id, 'reference not found in bank');
  const [adm3] = await q(`select amount_paid, payment_status::text from admissions where id=$1`, [ids.admission]);
  const [rej] = await q(`select status::text, note from payments where id=$1`, [claimId]);
  check('a rejected counsellor claim leaves amountPaid unchanged and keeps the reason', adm3.amount_paid === 3000 && rej.status === 'rejected' && /REJECTED/.test(rej.note ?? ''), JSON.stringify({ paid: adm3.amount_paid, rej }));

  // overpayment and the second instalment by the admin
  check('a payment above the outstanding balance is refused', (await code(() => recordPayment(ids.admission, { amount: 3500, method: 'cash' }, admin.id, 'admin'))) !== 'no error');
  const fo1 = data(await getFeesOverview({ courseId: ids.course }));
  const tot1 = fo1.totals ?? fo1;
  check('Fees overview (this course) before the 2nd instalment: billed 6000, collected 3000, outstanding 3000', Number(tot1.billed) === 6000 && Number(tot1.collected) === 3000 && Number(tot1.outstanding ?? tot1.billed - tot1.collected) === 3000, JSON.stringify(tot1));
  const outst = data(await getOutstandingInstallments({ courseId: ids.course, page: 1, limit: 50 }));
  const outList = Array.isArray(outst) ? outst : (outst.items ?? outst.rows ?? []);
  check('Outstanding instalments lists the 2nd instalment (3000, due in 30 days)', outList.some((i) => (i.admissionId === ids.admission || i.admissionNo === adm.admission_no) && Number(i.amount) === 3000), JSON.stringify(outList[0] ?? {}).slice(0, 160));
  await recordPayment(ids.admission, { amount: 3000, method: 'upi', reference: 'UPI-ZZ-2' }, admin.id, 'admin');
  const [adm4] = await q(`select amount_paid, payment_status::text from admissions where id=$1`, [ids.admission]);
  check('admin records the 2nd instalment: verified at once → amountPaid 6000, status paid, all instalments paid', adm4.amount_paid === 6000 && adm4.payment_status === 'paid' && (await listInstallments(ids.admission)).every((i) => i.status === 'paid'), JSON.stringify(adm4));
  check('nothing further can be collected on a fully paid admission', (await code(() => recordPayment(ids.admission, { amount: 1, method: 'cash' }, admin.id, 'admin'))) !== 'no error');
  const fo2 = data(await getFeesOverview({ courseId: ids.course })); const tot2 = fo2.totals ?? fo2;
  check('Fees overview after: collected 6000, outstanding 0', Number(tot2.collected) === 6000 && Number(tot2.outstanding ?? tot2.billed - tot2.collected) === 0, JSON.stringify(tot2));
  const byC = (fo2.byCounsellor ?? []).find((r) => r.id === counsellor.id);
  check('By-counsellor breakdown credits the counsellor with this admission', !!byC && Number(byC.billed) >= 6000, JSON.stringify(byC ?? {}));

  // ── admissions list / summary / targets / dashboards / exports ──
  const adms = data(await listAdmissions({ page: 1, limit: 50, counsellorId: admin.id, viewAll: true, search: `ZZ Test Lead ${tag}` }));
  const admList = Array.isArray(adms) ? adms : (adms.items ?? adms.rows ?? []);
  check('Admissions list finds the student by name search', admList.some((a) => a.id === ids.admission || a.admissionNo === adm.admission_no), `${admList.length} rows`);
  const admsOwn = data(await listAdmissions({ page: 1, limit: 50, counsellorId: otherStaff?.id ?? admin.id, viewAll: false, search: `ZZ Test Lead ${tag}` }));
  const ownList = Array.isArray(admsOwn) ? admsOwn : (admsOwn.items ?? admsOwn.rows ?? []);
  check('another counsellor\'s admissions list does not include it', otherStaff ? !ownList.some((a) => a.id === ids.admission) : true);
  const summary = data(await getAdmissionsSummary({ counsellorId: counsellor.id, viewAll: false }));
  check('counsellor summary counts their admission and revenue', JSON.stringify(summary).includes('6000') || (summary.totalAdmissions ?? summary.admissions ?? 0) >= 1, JSON.stringify(summary).slice(0, 160));
  await setTarget({ counsellorId: counsellor.id, period, targetAdmissions: 5, targetRevenue: 50000 });
  const tgt = await getTarget(counsellor.id, period);
  check('monthly target set and read back', tgt && Number(tgt.targetAdmissions) === 5 && Number(tgt.targetRevenue) === 50000, JSON.stringify(tgt));
  const dash = data(await getCounsellorDashboard(counsellor.id, false));
  check('counsellor dashboard reports today\'s admission against the target', JSON.stringify(dash).includes('"target') && JSON.stringify(dash).match(/admission/i), JSON.stringify(dash).slice(0, 260));
  const ov = data(await getCrmOverview());
  check('CRM overview responds with totals', ov && Object.keys(ov).length >= 3, JSON.stringify(ov).slice(0, 200));
  const csvRev = await exportRevenueCsv('daily', 'counsellor');
  check('Revenue CSV (daily, by counsellor) contains the counsellor', csvRev.includes(counsellor.name), csvRev.split('\n').slice(0, 2).join(' | '));
  const csvAdm = await exportAdmissionsCsv();
  check('Admissions CSV contains the new ADM number with fee 6000 and paid 6000', csvAdm.split('\n').some((l) => l.includes(adm.admission_no) && l.includes('6000')), csvAdm.split('\n').find((l) => l.includes(adm.admission_no))?.slice(0, 160));
  const csvSrc = await exportLeadSourceCsv();
  check('Lead-source CSV counts walk-ins', /walk_in,\d+/.test(csvSrc), csvSrc.split('\n').slice(0, 3).join(' | '));

  // ── a free course converts without money; capacity is enforced ──
  const freeLead = await createLead({ studentName: `ZZ Free Lead ${tag}`, phone: `+9177${tag}`, source: 'referral', priority: 'warm', ownerId: counsellor.id }, admin.id, counsellor.id);
  ids.lead2 = freeLead.id;
  const [freeCourse] = await q(`insert into courses (title, subject, created_by, is_published, fee_amount) values ($1, 'ZZ', $2, true, 0) returning id`, [`ZZ TEST free course ${tag}`, admin.id]);
  const [freeBatch] = await q(`insert into batches (name, course_id, type, target_exam, start_date, end_date, capacity) values ('ZZ free', $1, 'offline', 'upsc', current_date, current_date + 60, 10) returning id`, [freeCourse.id]);
  ids.freeCourse = freeCourse.id; ids.freeBatch = freeBatch.id;
  const conv2 = await convertLead(ids.lead2, { batchId: ids.freeBatch }, admin.id, 'admin');
  ids.student2 = conv2.studentId ?? conv2.student?.id;
  const [admFree] = await q(`select fee_amount, payment_status::text from admissions where student_id=$1`, [ids.student2]);
  const [enrFree] = await q(`select status::text from batch_enrollments where user_id=$1`, [ids.student2]);
  check('free course: admin conversion needs no payment, admission paid, enrolment active at once', admFree.fee_amount === 0 && admFree.payment_status === 'paid' && enrFree.status === 'active', JSON.stringify({ admFree, enrFree }));
  const dupLead = await createLead({ studentName: `ZZ Dup ${tag}`, phone: `+9188${tag}`, source: 'other', priority: 'cold', ownerId: counsellor.id }, admin.id, counsellor.id);
  ids.lead3 = dupLead.id;
  check('a lead whose phone already belongs to a student cannot be converted again', (await code(() => convertLead(ids.lead3, { batchId: ids.freeBatch }, admin.id, 'admin'))) === 'PHONE_EXISTS');
  // capacity: batch allows 2 — one taken; the 2nd fits, the 3rd must be refused
  const capLeadA = await createLead({ studentName: `ZZ Cap A ${tag}`, phone: `+9166${tag}`, source: 'other', priority: 'cold', ownerId: counsellor.id }, admin.id, counsellor.id);
  const capLeadB = await createLead({ studentName: `ZZ Cap B ${tag}`, phone: `+9155${tag}`, source: 'other', priority: 'cold', ownerId: counsellor.id }, admin.id, counsellor.id);
  ids.lead4 = capLeadA.id; ids.lead5 = capLeadB.id;
  const cA = await convertLead(ids.lead4, { batchId: ids.batch, feePlanId: ids.plan, collectAmount: 3000, collectMethod: 'cash' }, admin.id, 'admin');
  ids.student3 = cA.studentId ?? cA.student?.id;
  const full = await code(() => convertLead(ids.lead5, { batchId: ids.batch, feePlanId: ids.plan, collectAmount: 3000, collectMethod: 'cash' }, admin.id, 'admin'));
  check('batch capacity enforced at conversion (2 seats: 3rd admission refused)', full === 'BATCH_FULL', full);
  const cs = await counsellorSummary();
  check('finance per-counsellor summary responds', Array.isArray(cs) && cs.length >= 1, `${cs.length} counsellors`);
  const pend = await exportPendingLeadsCsv();
  check('Pending-leads CSV lists the unconverted test leads', pend.includes(`ZZ Cap B ${tag}`), `${pend.split('\n').length - 1} rows`);
} catch (e) {
  fail++; console.log('FAIL unexpected error:', e.message, e.code ?? '', (e.stack ?? '').split('\n')[1] ?? '');
} finally {
  const students = [ids.student, ids.student2, ids.student3].filter(Boolean);
  const leadsAll = [ids.lead, ids.lead2, ids.lead3, ids.lead4, ids.lead5].filter(Boolean);
  const del = async (sql, p) => q(sql, p).catch((e) => console.log('cleanup:', sql.split(' ')[2], e.message.slice(0, 70)));
  if (students.length) {
    await del(`delete from payments where admission_id in (select id from admissions where student_id = any($1::uuid[]))`, [students]);
    await del(`delete from admission_installments where admission_id in (select id from admissions where student_id = any($1::uuid[]))`, [students]);
    await del(`delete from admissions where student_id = any($1::uuid[])`, [students]);
    await del(`delete from batch_enrollments where user_id = any($1::uuid[])`, [students]);
    await del(`delete from notifications where user_id = any($1::uuid[])`, [students]);
    await del(`delete from streaks where user_id = any($1::uuid[])`, [students]);
  }
  if (leadsAll.length) {
    await del(`delete from lead_followups where lead_id = any($1::uuid[])`, [leadsAll]);
    await del(`delete from lead_status_history where lead_id = any($1::uuid[])`, [leadsAll]);
    await del(`delete from leads where id = any($1::uuid[])`, [leadsAll]);
  }
  if (students.length) await del(`delete from users where id = any($1::uuid[])`, [students]);
  await del(`delete from counsellor_targets where counsellor_id=$1 and period=$2`, [counsellor.id, period]);
  if (ids.plan) await del(`delete from fee_plans where id=$1`, [ids.plan]);
  for (const b of [ids.batch, ids.freeBatch].filter(Boolean)) await del(`delete from batches where id=$1`, [b]);
  for (const cid of [ids.course, ids.freeCourse].filter(Boolean)) await del(`delete from courses where id=$1`, [cid]);
  await del(`delete from audit_logs where meta::text like $1 or entity_id = any($2::uuid[])`, [`%${tag}%`, [...students, ...leadsAll, ids.admission].filter(Boolean)]);
  const [{ left }] = await q(`select count(*)::int as left from users where name like $1`, [`ZZ % ${tag}`]);
  const [{ lleft }] = await q(`select count(*)::int as lleft from leads where student_name like $1`, [`ZZ % ${tag}`]);
  const [{ cleft }] = await q(`select count(*)::int as cleft from courses where title like $1`, [`ZZ TEST % ${tag}`]);
  console.log(`cleanup: leftover users=${left} leads=${lleft} courses=${cleft}`);
  await c.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
