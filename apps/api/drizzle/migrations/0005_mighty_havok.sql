DO $$ BEGIN
 CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'lead_assigned';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'verification_update';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'admission_update';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE 'credentials_issued';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"documents" jsonb
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verification_status" "verification_status" DEFAULT 'verified' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_verification" ADD CONSTRAINT "student_verification_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_verification" ADD CONSTRAINT "student_verification_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_verification_student" ON "student_verification" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_verification_status" ON "student_verification" USING btree ("status");