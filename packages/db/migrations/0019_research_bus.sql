-- Research bus (D-039): requests, append-only evidence, results, run projection.
ALTER TABLE "library_concepts" DROP CONSTRAINT IF EXISTS "library_concepts_curation_status_check";
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "research_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "library_concepts" ADD COLUMN IF NOT EXISTS "research_run_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid,
	"mode" text NOT NULL,
	"query_text" text DEFAULT '' NOT NULL,
	"topic_id" uuid,
	"topic_scope" text DEFAULT '' NOT NULL,
	"source_module_id" uuid,
	"source_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_evidence" integer DEFAULT 8 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"envelope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"causation_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid,
	"request_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"feed_class" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"digest" text NOT NULL,
	"legal_use_class" text DEFAULT 'ALLOWED' NOT NULL,
	"expires_at" timestamp with time zone,
	"artifact_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_ref" text,
	"authority_class" text DEFAULT 'DETERMINISTIC' NOT NULL,
	"package" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid,
	"status" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifact_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation" jsonb,
	"admission_mode" text,
	"summary_band" text DEFAULT 'medium' NOT NULL,
	"failure_reason" text,
	"envelope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid,
	"phase" text DEFAULT 'gather' NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"concept_count" integer DEFAULT 0 NOT NULL,
	"validation_passed" boolean,
	"admission_applied" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_requests" ADD CONSTRAINT "research_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_requests" ADD CONSTRAINT "research_requests_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_requests" ADD CONSTRAINT "research_requests_source_module_id_modules_id_fk" FOREIGN KEY ("source_module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_evidence" ADD CONSTRAINT "research_evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_evidence" ADD CONSTRAINT "research_evidence_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_evidence" ADD CONSTRAINT "research_evidence_request_id_research_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."research_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_results" ADD CONSTRAINT "research_results_request_id_research_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."research_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_results" ADD CONSTRAINT "research_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_results" ADD CONSTRAINT "research_results_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_request_id_research_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."research_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_requests_company_idx" ON "research_requests" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_requests_module_idx" ON "research_requests" USING btree ("module_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_evidence_request_idx" ON "research_evidence" USING btree ("request_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_evidence_company_idx" ON "research_evidence" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_evidence_digest_unique" ON "research_evidence" USING btree ("company_id","digest");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_results_request_unique" ON "research_results" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_results_company_idx" ON "research_results" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_runs_request_unique" ON "research_runs" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_runs_company_idx" ON "research_runs" USING btree ("company_id","created_at");
