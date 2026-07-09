import {
  pgTable,
  pgEnum,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  date,
  uuid,
  index,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Enums ─────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', ['student', 'instructor', 'admin']);
export const batchTypeEnum = pgEnum('batch_type', ['online', 'offline', 'hybrid']);
export const batchStatusEnum = pgEnum('batch_status', ['upcoming', 'active', 'completed', 'archived']);
export const lessonTypeEnum = pgEnum('lesson_type', ['video', 'pdf', 'audio', 'live_recording']);
export const examTypeEnum = pgEnum('exam_type', ['practice', 'chapter', 'mock', 'previous_year']);
export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard']);
export const doubtStatusEnum = pgEnum('doubt_status', ['open', 'ai_answered', 'escalated', 'resolved']);
export const attendanceTypeEnum = pgEnum('attendance_type', ['live_class', 'offline']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'absent', 'late']);
export const notificationTypeEnum = pgEnum('notification_type', ['class_reminder', 'exam_alert', 'result', 'announcement', 'doubt_reply', 'achievement']);
export const leaderboardPeriodEnum = pgEnum('leaderboard_period', ['weekly', 'monthly', 'all_time']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', ['active', 'expired', 'suspended']);
export const targetExamEnum = pgEnum('target_exam', ['upsc', 'kerala_psc', 'other_psc']);

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: varchar('phone', { length: 15 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('student'),
  // Email+password login for admin/instructor only (students use OTP)
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  targetExam: targetExamEnum('target_exam').default('upsc'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  phoneIdx: index('idx_users_phone').on(t.phone),
  roleIdx: index('idx_users_role').on(t.role),
}));

// ── Refresh tokens ────────────────────────────────────────────────────────────
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('idx_refresh_tokens_user').on(t.userId),
}));

// ── Batches ───────────────────────────────────────────────────────────────────
export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  type: batchTypeEnum('type').notNull(),
  targetExam: targetExamEnum('target_exam').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  capacity: integer('capacity').notNull().default(100),
  status: batchStatusEnum('status').notNull().default('upcoming'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const batchInstructors = pgTable('batch_instructors', {
  batchId: uuid('batch_id').notNull().references(() => batches.id, { onDelete: 'cascade' }),
  instructorId: uuid('instructor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqBatchInstructor: uniqueIndex('uq_batch_instructor').on(t.batchId, t.instructorId),
}));

export const batchEnrollments = pgTable('batch_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull().references(() => batches.id, { onDelete: 'cascade' }),
  status: enrollmentStatusEnum('status').notNull().default('active'),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (t) => ({
  uqEnrollment: uniqueIndex('uq_enrollment').on(t.userId, t.batchId),
  userIdx: index('idx_enrollment_user').on(t.userId),
  batchIdx: index('idx_enrollment_batch').on(t.batchId),
}));

// ── Courses ───────────────────────────────────────────────────────────────────
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 100 }).notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  isPublished: boolean('is_published').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const batchCourses = pgTable('batch_courses', {
  batchId: uuid('batch_id').notNull().references(() => batches.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
}, (t) => ({
  uqBatchCourse: uniqueIndex('uq_batch_course').on(t.batchId, t.courseId),
}));

export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  order: integer('order').notNull().default(0),
  unlockDate: timestamp('unlock_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  courseIdx: index('idx_modules_course').on(t.courseId),
}));

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  type: lessonTypeEnum('type').notNull(),
  bunnyVideoId: text('bunny_video_id'),
  bunnyLibraryId: text('bunny_library_id'),
  fileUrl: text('file_url'),
  duration: integer('duration'),
  order: integer('order').notNull().default(0),
  isDownloadable: boolean('is_downloadable').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  moduleIdx: index('idx_lessons_module').on(t.moduleId),
}));

export const lessonProgress = pgTable('lesson_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  watchedSeconds: integer('watched_seconds').notNull().default(0),
  isCompleted: boolean('is_completed').notNull().default(false),
  lastWatchedAt: timestamp('last_watched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqLessonProgress: uniqueIndex('uq_lesson_progress').on(t.userId, t.lessonId),
}));

// ── Exams ─────────────────────────────────────────────────────────────────────
export const exams = pgTable('exams', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 100 }).notNull(),
  type: examTypeEnum('type').notNull().default('practice'),
  durationMins: integer('duration_mins').notNull(),
  negMarks: real('neg_marks').notNull().default(0),
  passPercent: real('pass_percent').notNull().default(40),
  maxAttempts: integer('max_attempts').default(1),
  scheduleStart: timestamp('schedule_start', { withTimezone: true }),
  scheduleEnd: timestamp('schedule_end', { withTimezone: true }),
  batchIds: uuid('batch_ids').array(),
  isPublished: boolean('is_published').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id').references(() => exams.id, { onDelete: 'set null' }),
  subject: varchar('subject', { length: 100 }).notNull(),
  chapter: varchar('chapter', { length: 255 }),
  difficulty: difficultyEnum('difficulty').notNull().default('medium'),
  body: text('body').notNull(),
  options: jsonb('options').notNull().$type<string[]>(),
  correctIndex: integer('correct_index').notNull(),
  explanation: text('explanation'),
  imageUrl: text('image_url'),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  examIdx: index('idx_questions_exam').on(t.examId),
  subjectIdx: index('idx_questions_subject').on(t.subject),
}));

export const examAttempts = pgTable('exam_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  score: real('score'),
  maxScore: real('max_score'),
  rank: integer('rank'),
  answersJson: jsonb('answers_json').$type<Record<string, number>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  isAutoSubmitted: boolean('is_auto_submitted').notNull().default(false),
  tabSwitchCount: integer('tab_switch_count').notNull().default(0),
}, (t) => ({
  examIdx: index('idx_attempts_exam').on(t.examId),
  studentIdx: index('idx_attempts_student').on(t.studentId),
}));

// ── Live Classes ──────────────────────────────────────────────────────────────
export const liveClasses = pgTable('live_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => batches.id, { onDelete: 'cascade' }),
  subject: varchar('subject', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  instructorId: uuid('instructor_id').notNull().references(() => users.id),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  agoraChannel: varchar('agora_channel', { length: 255 }),
  recordingUrl: text('recording_url'),
  recordingLessonId: uuid('recording_lesson_id').references(() => lessons.id),
  isCompleted: boolean('is_completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  batchIdx: index('idx_live_classes_batch').on(t.batchId),
  startIdx: index('idx_live_classes_start').on(t.startTime),
}));

// ── Attendance ────────────────────────────────────────────────────────────────
export const attendance = pgTable('attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull().references(() => batches.id, { onDelete: 'cascade' }),
  liveClassId: uuid('live_class_id').references(() => liveClasses.id),
  date: date('date').notNull(),
  type: attendanceTypeEnum('type').notNull(),
  status: attendanceStatusEnum('status').notNull(),
  markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  studentIdx: index('idx_attendance_student').on(t.studentId),
  batchDateIdx: index('idx_attendance_batch_date').on(t.batchId, t.date),
}));

// ── Doubts ────────────────────────────────────────────────────────────────────
export const doubts = pgTable('doubts', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subject: varchar('subject', { length: 100 }).notNull(),
  body: text('body').notNull(),
  imageUrl: text('image_url'),
  aiAnswer: text('ai_answer'),
  aiConfidence: real('ai_confidence'),
  humanAnswer: text('human_answer'),
  status: doubtStatusEnum('status').notNull().default('open'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  studentIdx: index('idx_doubts_student').on(t.studentId),
  statusIdx: index('idx_doubts_status').on(t.status),
}));

// ── Device Tokens (FCM) ───────────────────────────────────────────────────────
export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  platform: varchar('platform', { length: 10 }).notNull(), // 'android' | 'ios'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('idx_device_tokens_user').on(t.userId),
  tokenUq: uniqueIndex('uq_device_token').on(t.token),
}));

// ── Notifications ─────────────────────────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  type: notificationTypeEnum('type').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('idx_notifications_user').on(t.userId),
  createdIdx: index('idx_notifications_created').on(t.createdAt),
}));

// ── Leaderboard ───────────────────────────────────────────────────────────────
export const leaderboard = pgTable('leaderboard', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'cascade' }),
  period: leaderboardPeriodEnum('period').notNull(),
  totalScore: real('total_score').notNull().default(0),
  examScore: real('exam_score').notNull().default(0),
  studyTimeScore: real('study_time_score').notNull().default(0),
  streakScore: real('streak_score').notNull().default(0),
  rank: integer('rank'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqLeaderboard: uniqueIndex('uq_leaderboard').on(t.studentId, t.batchId, t.period),
  batchPeriodIdx: index('idx_leaderboard_batch_period').on(t.batchId, t.period),
}));

// ── Streaks & XP ──────────────────────────────────────────────────────────────
export const streaks = pgTable('streaks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastStudyDate: date('last_study_date'),
  totalXp: integer('total_xp').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── RAG Content Chunks (pgvector) ─────────────────────────────────────────────
// Requires `CREATE EXTENSION IF NOT EXISTS vector;` — added manually to the
// migration. Dim 1024 matches EMBEDDINGS_DIM in the AI service; changing the
// embeddings provider to a different dim requires a re-migration + reindex.
export const contentChunks = pgTable('content_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: varchar('source_type', { length: 30 }).notNull(), // course | current_affair | question
  sourceId: uuid('source_id').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sourceUq: uniqueIndex('uq_chunk_source').on(t.sourceType, t.sourceId),
  embeddingIdx: index('idx_chunk_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
}));

// ── Current Affairs ───────────────────────────────────────────────────────────
export const currentAffairs = pgTable('current_affairs', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  summary: text('summary').notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  sourceUrl: text('source_url'),
  upscRelevance: real('upsc_relevance').notNull().default(0),
  quizQuestion: text('quiz_question'),
  quizOptions: jsonb('quiz_options').$type<string[]>(),
  quizCorrectIndex: integer('quiz_correct_index'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  publishedIdx: index('idx_current_affairs_published').on(t.publishedAt),
  categoryIdx: index('idx_current_affairs_category').on(t.category),
}));

// ── Relations ─────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  enrollments: many(batchEnrollments),
  examAttempts: many(examAttempts),
  doubts: many(doubts),
  attendance: many(attendance),
  streak: many(streaks),
  lessonProgress: many(lessonProgress),
}));

export const batchesRelations = relations(batches, ({ many }) => ({
  enrollments: many(batchEnrollments),
  instructors: many(batchInstructors),
  courses: many(batchCourses),
  liveClasses: many(liveClasses),
  attendance: many(attendance),
  leaderboard: many(leaderboard),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  modules: many(modules),
  batches: many(batchCourses),
}));

export const modulesRelations = relations(modules, ({ one, many }) => ({
  course: one(courses, { fields: [modules.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  module: one(modules, { fields: [lessons.moduleId], references: [modules.id] }),
  progress: many(lessonProgress),
}));

export const examsRelations = relations(exams, ({ many }) => ({
  questions: many(questions),
  attempts: many(examAttempts),
}));
