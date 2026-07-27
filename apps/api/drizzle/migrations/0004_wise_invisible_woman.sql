DO $$ BEGIN
 CREATE TYPE "public"."lead_priority" AS ENUM('hot', 'warm', 'cold');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."lead_source" AS ENUM('facebook', 'instagram', 'google', 'website', 'walk_in', 'referral', 'seminar', 'campaign', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'interested', 'demo', 'counselling', 'fee_discussion', 'admission_confirmed', 'converted', 'not_interested', 'lost');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_status" AS ENUM('pending', 'partial', 'paid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_no" varchar(30) NOT NULL,
	"student_id" uuid NOT NULL,
	"lead_id" uuid,
	"counsellor_id" uuid,
	"course_id" uuid,
	"batch_id" uuid,
	"branch_id" uuid,
	"admission_date" date NOT NULL,
	"fee_plan" varchar(120),
	"fee_amount" real DEFAULT 0 NOT NULL,
	"amount_paid" real DEFAULT 0 NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissions_admission_no_unique" UNIQUE("admission_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "counsellor_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counsellor_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"target_admissions" integer DEFAULT 0 NOT NULL,
	"target_revenue" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"staff_id" uuid,
	"remarks" text NOT NULL,
	"call_summary" text,
	"next_action" varchar(255),
	"reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" "lead_status",
	"to_status" "lead_status" NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_code" varchar(30) NOT NULL,
	"student_name" varchar(255) NOT NULL,
	"parent_name" varchar(255),
	"phone" varchar(20) NOT NULL,
	"whatsapp" varchar(20),
	"email" varchar(255),
	"city" varchar(120),
	"state" varchar(120),
	"course_interested" varchar(255),
	"source" "lead_source" DEFAULT 'other' NOT NULL,
	"priority" "lead_priority" DEFAULT 'warm' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"owner_id" uuid NOT NULL,
	"branch_id" uuid,
	"remarks" text,
	"next_followup_at" timestamp with time zone,
	"converted_student_id" uuid,
	"converted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_lead_code_unique" UNIQUE("lead_code")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admissions" ADD CONSTRAINT "admissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admissions" ADD CONSTRAINT "admissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admissions" ADD CONSTRAINT "admissions_counsellor_id_users_id_fk" FOREIGN KEY ("counsellor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admissions" ADD CONSTRAINT "admissions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admissions" ADD CONSTRAINT "admissions_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admissions" ADD CONSTRAINT "admissions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "counsellor_targets" ADD CONSTRAINT "counsellor_targets_counsellor_id_users_id_fk" FOREIGN KEY ("counsellor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_followups" ADD CONSTRAINT "lead_followups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_followups" ADD CONSTRAINT "lead_followups_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_student_id_users_id_fk" FOREIGN KEY ("converted_student_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admissions_student" ON "admissions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admissions_counsellor" ON "admissions" USING btree ("counsellor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admissions_batch" ON "admissions" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admissions_branch" ON "admissions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admissions_date" ON "admissions" USING btree ("admission_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_counsellor_target" ON "counsellor_targets" USING btree ("counsellor_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_followups_lead" ON "lead_followups" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_history_lead" ON "lead_status_history" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_owner" ON "leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_status" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_branch" ON "leads" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_followup" ON "leads" USING btree ("next_followup_at");--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS lead_seq START 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS adm_seq START 1;