ALTER TYPE "exam_type" ADD VALUE 'topic_quiz';--> statement-breakpoint
ALTER TABLE "doubts" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "lesson_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exams" ADD CONSTRAINT "exams_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exams_lesson" ON "exams" USING btree ("lesson_id");