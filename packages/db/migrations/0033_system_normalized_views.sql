-- D-072: verified normalize seals + D-071 curation score telemetry
CREATE TABLE IF NOT EXISTS "system_normalized_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_key" text NOT NULL,
	"seal_id" text NOT NULL,
	"bundle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"report_concept_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "system_normalized_views_seal_unique" ON "system_normalized_views" ("company_id","kind","subject_key","seal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "system_normalized_views_lookup_idx" ON "system_normalized_views" ("company_id","kind","subject_key","expires_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_normalized_views" ADD CONSTRAINT "system_normalized_views_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_normalized_views" ADD CONSTRAINT "system_normalized_views_report_concept_id_concepts_id_fk" FOREIGN KEY ("report_concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curation_score_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"concept_id" uuid,
	"gate_id" text NOT NULL,
	"score_band" text NOT NULL,
	"passed" boolean NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"raw_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curation_score_events_company_idx" ON "curation_score_events" ("company_id","created_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curation_score_events" ADD CONSTRAINT "curation_score_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curation_score_events" ADD CONSTRAINT "curation_score_events_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
