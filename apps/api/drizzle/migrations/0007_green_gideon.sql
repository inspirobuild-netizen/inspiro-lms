DO $$ BEGIN
 CREATE TYPE "public"."installment_status" AS ENUM('pending', 'paid', 'waived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_method" AS ENUM('upi', 'cash', 'card', 'bank_transfer', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"label" varchar(120) NOT NULL,
	"amount" real NOT NULL,
	"due_date" date NOT NULL,
	"status" "installment_status" DEFAULT 'pending' NOT NULL,
	"paid_amount" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"total_amount" real NOT NULL,
	"installments" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_id" uuid NOT NULL,
	"installment_id" uuid,
	"amount" real NOT NULL,
	"method" "payment_method" DEFAULT 'upi' NOT NULL,
	"reference" varchar(120),
	"note" text,
	"collected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admissions" ADD COLUMN "fee_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "upi_vpa" varchar(120);--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "upi_payee_name" varchar(120);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "fee_amount" real DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admission_installments" ADD CONSTRAINT "admission_installments_admission_id_admissions_id_fk" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_admission_id_admissions_id_fk" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_installment_id_admission_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."admission_installments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_collected_by_users_id_fk" FOREIGN KEY ("collected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_installments_admission" ON "admission_installments" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_installments_due" ON "admission_installments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_installments_status" ON "admission_installments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_plans_course" ON "fee_plans" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_admission" ON "payments" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_created" ON "payments" USING btree ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admissions" ADD CONSTRAINT "admissions_fee_plan_id_fee_plans_id_fk" FOREIGN KEY ("fee_plan_id") REFERENCES "public"."fee_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
