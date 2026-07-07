import 'dotenv/config';
import { db } from '../src/lib/db.js';
import { users, batches, courses, modules, lessons } from './schema.js';

async function seed() {
  console.log('Seeding database...');

  // Admin user
  const [admin] = await db.insert(users).values({
    phone: '+919999999999',
    email: 'admin@inspiro.in',
    name: 'Inspiro Admin',
    role: 'admin',
    targetExam: 'kerala_psc',
  }).returning().onConflictDoNothing();

  // Instructor
  const [instructor] = await db.insert(users).values({
    phone: '+918888888888',
    email: 'faculty@inspiro.in',
    name: 'Dr. Rajan Kumar',
    role: 'instructor',
    targetExam: 'upsc',
  }).returning().onConflictDoNothing();

  // Demo student
  const [student] = await db.insert(users).values({
    phone: '+917777777777',
    name: 'Arun Krishnan',
    role: 'student',
    targetExam: 'kerala_psc',
  }).returning().onConflictDoNothing();

  if (!admin || !instructor || !student) {
    console.log('Seed data already exists, skipping.');
    process.exit(0);
  }

  // Batch
  const [batch] = await db.insert(batches).values({
    name: 'Kerala PSC 2025 — Batch A',
    type: 'hybrid',
    targetExam: 'kerala_psc',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    capacity: 100,
    status: 'active',
  }).returning();

  // Course
  const [course] = await db.insert(courses).values({
    title: 'Kerala History & Culture',
    subject: 'History',
    description: 'Comprehensive coverage of Kerala history for PSC exams',
    isPublished: true,
    createdBy: instructor.id,
  }).returning();

  // Module
  const [mod] = await db.insert(modules).values({
    courseId: course!.id,
    title: 'Ancient Kerala',
    order: 1,
  }).returning();

  // Lesson
  await db.insert(lessons).values({
    moduleId: mod!.id,
    title: 'Introduction to Kerala History',
    type: 'video',
    duration: 2400,
    order: 1,
  });

  console.log('Seed complete.');
  console.log(`  Admin:      ${admin.phone}`);
  console.log(`  Instructor: ${instructor.phone}`);
  console.log(`  Student:    ${student.phone}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
