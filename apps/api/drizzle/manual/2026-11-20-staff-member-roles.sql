-- Staff can hold several roles (20 Nov 2026). Applied by hand, as every schema change since
-- migration 0011 has been: drizzle-kit's snapshots stop at 0011, so `drizzle-kit generate`
-- now emits a migration full of already-applied changes that would fail halfway on production.
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS "staff_member_roles" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "staff_role_id" uuid NOT NULL REFERENCES "staff_roles"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_member_roles_user_id_staff_role_id_pk" PRIMARY KEY ("user_id", "staff_role_id")
);

CREATE INDEX IF NOT EXISTS "idx_staff_member_roles_role" ON "staff_member_roles" USING btree ("staff_role_id");

-- Everyone keeps the role they have: it becomes their first (and main) linked role.
INSERT INTO "staff_member_roles" ("user_id", "staff_role_id")
SELECT "id", "staff_role_id" FROM "users"
WHERE "role" = 'staff' AND "staff_role_id" IS NOT NULL
ON CONFLICT DO NOTHING;
