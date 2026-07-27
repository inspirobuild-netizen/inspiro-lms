import type { FastifyInstance } from 'fastify';
import { or, ilike, eq, and } from 'drizzle-orm';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { db } from '../../lib/db.js';
import { users, leads, courses, batches, admissions } from '../../../drizzle/schema.js';

// Global search across students, leads, counsellors, courses, batches by
// name/phone/email/admission-no. Admin/staff only — scoped by role, not by
// lead ownership (this is an admin-facing lookup tool, not the leads list).
export default async function searchRoutes(app: FastifyInstance) {
  app.get('/admin/search', { preHandler: [authenticate, requireRole(['admin', 'staff', 'instructor'])] }, async (req, reply) => {
    const q = ((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return reply.send({ success: true, data: { students: [], staff: [], leads: [], courses: [], batches: [] } });
    const like = `%${q}%`;

    const [students, staff, leadRows, courseRows, batchRows] = await Promise.all([
      db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email })
        .from(users).where(and(eq(users.role, 'student'), or(ilike(users.name, like), ilike(users.phone, like), ilike(users.email, like))!)).limit(10),
      db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email })
        .from(users).where(and(eq(users.role, 'staff'), or(ilike(users.name, like), ilike(users.phone, like), ilike(users.email, like))!)).limit(10),
      db.select({ id: leads.id, leadCode: leads.leadCode, studentName: leads.studentName, phone: leads.phone, status: leads.status })
        .from(leads).where(or(ilike(leads.studentName, like), ilike(leads.phone, like), ilike(leads.leadCode, like))!).limit(10),
      db.select({ id: courses.id, title: courses.title, subject: courses.subject })
        .from(courses).where(ilike(courses.title, like)).limit(10),
      db.select({ id: batches.id, name: batches.name })
        .from(batches).where(ilike(batches.name, like)).limit(10),
    ]);

    // Admission-number search overlays into the students bucket.
    const byAdmission = await db
      .select({ id: users.id, name: users.name, phone: users.phone, email: users.email })
      .from(admissions)
      .innerJoin(users, eq(users.id, admissions.studentId))
      .where(ilike(admissions.admissionNo, like))
      .limit(10);

    const seen = new Set(students.map((s) => s.id));
    const merged = [...students, ...byAdmission.filter((s) => !seen.has(s.id))];

    return reply.send({ success: true, data: { students: merged, staff, leads: leadRows, courses: courseRows, batches: batchRows } });
  });
}
