// Staff with several roles, mentor-only batch instructors, and permanent staff delete, against
// production data. Creates two throwaway roles, one throwaway staff member and two throwaway
// batches (no students), and removes them all.
// Run in a one-off api container (see HANDOVER.md):  node --no-warnings /app/x.mjs
import pg from 'pg';
import { createStaff, getStaffById, listStaff, updateStaff } from './dist/src/modules/staff/staff.service.js';
import { createStaffRole, setRolePermissions, deleteStaffRole, listStaffRoles } from './dist/src/modules/staff-roles/staff-roles.service.js';
import { getStaffPermissions, holdsStaffRole } from './dist/src/lib/permissions.js';
import { loginWithPassword } from './dist/src/modules/auth/auth.service.js';
import { createBatch, assignInstructor, listInstructorOptions, getBatchById } from './dist/src/modules/batches/batches.service.js';
import { staffDeletionImpact, deleteStaffPermanently } from './dist/src/modules/staff/staff-purge.service.js';
import { redis } from './dist/src/lib/redis.js';

const COURSE = '43a47f5a-3abe-4298-8b50-d92c07984dce'; // Junior IAS Stream 1
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };
const code = async (fn) => { try { await fn(); return 'no error'; } catch (e) { return e.code ?? e.message; } };

const tag = Date.now().toString().slice(-8);
const email = `zz.check.${tag}@example.com`;
const password = `Zz-check-${tag}`;
const [admin] = await q(`select id from users where role='admin' and is_active limit 1`);
const [mentorRole] = await q(`select id from staff_roles where slug='mentor'`);
const made = { roles: [], batches: [], staff: null };
try {
  const roleA = await createStaffRole({ name: `ZZ Check A ${tag}` }); made.roles.push(roleA.id);
  const roleB = await createStaffRole({ name: `ZZ Check B ${tag}` }); made.roles.push(roleB.id);
  await setRolePermissions(roleA.id, ['leads.view']);
  await setRolePermissions(roleB.id, ['doubts.view']);

  const staff = await createStaff({ name: 'ZZ Check Staff', email, phone: '+9190' + tag, password, staffRoleIds: [roleA.id, roleB.id] });
  made.staff = staff.id;
  check('created with two roles; the first is the main one', staff.staffRoles.length === 2 && staff.staffRoleId === roleA.id, staff.roleName);
  const perms = await getStaffPermissions(staff.id);
  check('permissions are the union of both roles', perms.includes('leads.view') && perms.includes('doubts.view'), perms.join(','));
  const login = await loginWithPassword(email, password);
  check('sign-in carries both roles and the merged permissions',
    login.user.staffRoles?.length === 2 && login.user.staffRole?.id === roleA.id && login.user.permissions.includes('leads.view') && login.user.permissions.includes('doubts.view'));
  const byB = await listStaff({ page: 1, limit: 100, staffRoleId: roleB.id });
  check('the staff list finds them under their second role too', byB.items.some((s) => s.id === staff.id));
  const counts = await listStaffRoles();
  check('each role counts them as a member', [roleA.id, roleB.id].every((id) => counts.find((r) => r.id === id)?.memberCount === 1));
  check('a role someone holds cannot be deleted', (await code(() => deleteStaffRole(roleB.id))) === 'ROLE_IN_USE');

  for (const name of ['ZZ check batch 1', 'ZZ check batch 2']) {
    const b = await createBatch({ name, courseId: COURSE, type: 'online', targetExam: 'upsc', startDate: '2030-01-01', endDate: '2030-12-31', capacity: 1 });
    made.batches.push(b.id);
  }
  check('without the Mentor role they cannot be a batch instructor', !(await holdsStaffRole(staff.id, 'mentor')) && (await code(() => assignInstructor(made.batches[0], staff.id))) === 'NOT_A_MENTOR');
  check('nor can an admin account', (await code(() => assignInstructor(made.batches[0], admin.id))) === 'NOT_A_MENTOR');

  const withMentor = await updateStaff(staff.id, { staffRoleIds: [roleA.id, mentorRole.id] });
  check('roles changed to A + Mentor', withMentor.staffRoles.length === 2 && (await holdsStaffRole(staff.id, 'mentor')), withMentor.roleName);
  const afterPerms = await getStaffPermissions(staff.id);
  check('permissions follow the change at once', afterPerms.includes('leads.view'), afterPerms.join(','));
  const legacy = await updateStaff(staff.id, { staffRoleId: roleA.id, designation: 'ZZ' });
  check('an older screen re-sending the main role keeps the other roles', legacy.staffRoles.length === 2, legacy.roleName);

  check('the instructor picker offers them', (await listInstructorOptions()).some((u) => u.id === staff.id));
  await assignInstructor(made.batches[0], staff.id);
  await assignInstructor(made.batches[1], staff.id);
  const detail = await getBatchById(made.batches[1]);
  check('the same mentor teaches two batches', detail.instructors.some((i) => i.id === staff.id));

  const impact = await staffDeletionImpact(staff.id);
  check('delete preview: two batches taught, both roles named', impact.batchesTaught === 2 && impact.roles.length === 2, JSON.stringify({ batches: impact.batchesTaught, roles: impact.roles }));
  check('nobody can delete their own account', (await code(() => deleteStaffPermanently(staff.id, staff.id))) === 'CANNOT_DELETE_SELF');
  await deleteStaffPermanently(staff.id, admin.id);
  const [left] = await q(`select (select count(*) from users where id=$1)::int u, (select count(*) from batch_instructors where instructor_id=$1)::int b,
    (select count(*) from staff_member_roles where user_id=$1)::int r, (select count(*) from staff_profiles where user_id=$1)::int p`, [staff.id]);
  check('deleted: account, roles, profile and instructor assignments are gone', left.u + left.b + left.r + left.p === 0, JSON.stringify(left));
  check('their sign-in is refused afterwards', (await code(() => loginWithPassword(email, password))) !== 'no error');
  check('the email is free again', (await q(`select count(*)::int n from users where email=$1`, [email]))[0].n === 0);
  made.staff = null;
} finally {
  if (made.staff) await q(`delete from users where id=$1`, [made.staff]).catch((e) => console.log('cleanup staff:', e.message.slice(0, 60)));
  for (const id of made.batches) await q(`delete from batches where id=$1`, [id]).catch((e) => console.log('cleanup batch:', e.message.slice(0, 60)));
  for (const id of made.roles) await deleteStaffRole(id).catch((e) => console.log('cleanup role:', e.message.slice(0, 60)));
  const [n] = await q(`select (select count(*) from staff_roles where name like 'ZZ Check %')::int + (select count(*) from batches where name like 'ZZ check batch%')::int
    + (select count(*) from users where email like 'zz.check.%@example.com')::int n`);
  console.log(`cleanup: throwaway rows left = ${n.n}`);
  await c.end(); await redis.quit().catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
