-- D-082: append-only operator philosophy directives (agent-non-editable)
CREATE TABLE IF NOT EXISTS "operator_philosophy_directives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid,
	"body" text NOT NULL,
	"created_by_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "operator_philosophy_directives_company_idx" ON "operator_philosophy_directives" ("company_id","created_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "operator_philosophy_directives" ADD CONSTRAINT "operator_philosophy_directives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "operator_philosophy_directives" ADD CONSTRAINT "operator_philosophy_directives_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
