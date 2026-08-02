import type { FastifyInstance } from 'fastify';
import { or, ilike, eq, and } from 'drizzle-orm';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { hasPermission } from '../../middleware/require-permission.js';
import { db } from '../../lib/db.js';
import { users, leads, courses, batches, admissions } from '../../../drizzle/schema.js';

// Global search across students, leads, counsellors, courses, batches by
// name/phone/email/admission-no. Admin/staff only. Students and leads are
// scoped by permission: without students.view, the students bucket is
// empty; without leads.view_all, lead/admission-number results are
// limited to the caller's own pipeline — this is a lookup tool, not a
// way to browse other counsellors' data.
export default async function searchRoutes(app: FastifyInstance) {
  app.get('/admin/search', { preHandler: [authenticate, requireRole(['admin', 'staff', 'instructor'])] }, async (req, reply) => {
    const q = ((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return reply.send({ success: true, data: { students: [], staff: [], leads: [], courses: [], batches: [] } });
    const like = `%${q}%`;

    const canViewAllStudents = await hasPermission(req, 'students.view');
    const canViewAllLeads = await hasPermission(req, 'leads.view_all');
    const leadOwn = canViewAllLeads ? undefined : eq(leads.ownerId, req.user.sub);
    const admissionOwn = canViewAllStudents ? undefined : eq(admissions.counsellorId, req.user.sub);

    const [students, staff, leadRows, courseRows, batchRows] = await Promise.all([
      canViewAllStudents
        ? db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email })
            .from(users).where(and(eq(users.role, 'student'), or(ilike(users.name, like), ilike(users.phone, like), ilike(users.email, like))!)).limit(10)
        : Promise.resolve([]),
      db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email })
        .from(users).where(and(eq(users.role, 'staff'), or(ilike(users.name, like), ilike(users.phone, like), ilike(users.email, like))!)).limit(10),
      db.select({ id: leads.id, leadCode: leads.leadCode, studentName: leads.studentName, phone: leads.phone, status: leads.status })
        .from(leads).where(and(leadOwn, or(ilike(leads.studentName, like), ilike(leads.phone, like), ilike(leads.leadCode, like))!)).limit(10),
      db.select({ id: courses.id, title: courses.title, subject: courses.subject })
        .from(courses).where(ilike(courses.title, like)).limit(10),
      db.select({ id: batches.id, name: batches.name })
        .from(batches).where(ilike(batches.name, like)).limit(10),
    ]);

    // Admission-number search overlays into the students bucket — scoped to
    // the caller's own admissions unless they can see all students.
    const byAdmission = await db
      .select({ id: users.id, name: users.name, phone: users.phone, email: users.email })
      .from(admissions)
      .innerJoin(users, eq(users.id, admissions.studentId))
      .where(and(admissionOwn, ilike(admissions.admissionNo, like)))
      .limit(10);

    const seen = new Set(students.map((s) => s.id));
    const merged = [...students, ...byAdmission.filter((s) => !seen.has(s.id))];

    return reply.send({ success: true, data: { students: merged, staff, leads: leadRows, courses: courseRows, batches: batchRows } });
  });
}
