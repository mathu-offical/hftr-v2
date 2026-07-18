CREATE TABLE IF NOT EXISTS "market_hub_synthesis_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "status" text NOT NULL,
  "error_code" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_hub_synthesis_stages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "stage_id" text NOT NULL,
  "label" text NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL,
  "sort_order" integer NOT NULL,
  "summary" text,
  "justification_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "job_id" uuid,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_hub_synthesis_runs" ADD CONSTRAINT "market_hub_synthesis_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_hub_synthesis_stages" ADD CONSTRAINT "market_hub_synthesis_stages_run_id_market_hub_synthesis_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."market_hub_synthesis_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_hub_synthesis_stages" ADD CONSTRAINT "market_hub_synthesis_stages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_hub_synthesis_runs_company_started_idx" ON "market_hub_synthesis_runs" USING btree ("company_id","started_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_hub_synthesis_stages_run_stage_unique" ON "market_hub_synthesis_stages" USING btree ("run_id","stage_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_hub_synthesis_stages_company_run_idx" ON "market_hub_synthesis_stages" USING btree ("company_id","run_id");
