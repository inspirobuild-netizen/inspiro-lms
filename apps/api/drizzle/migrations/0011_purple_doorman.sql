DO $$ BEGIN
 CREATE TYPE "public"."enrollment_request_status" AS ENUM('pending', 'verified', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "lead_source" ADD VALUE 'mobile_app';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"lead_id" uuid,
	"course_id" uuid NOT NULL,
	"fee_plan_id" uuid,
	"amount" real NOT NULL,
	"method" "payment_method" DEFAULT 'upi' NOT NULL,
	"reference" varchar(120),
	"status" "enrollment_request_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"resulting_admission_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_resulting_admission_id_admissions_id_fk" FOREIGN KEY ("resulting_admission_id") REFERENCES "public"."admissions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enrollment_requests_student" ON "enrollment_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enrollment_requests_status" ON "enrollment_requests" USING btree ("status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
