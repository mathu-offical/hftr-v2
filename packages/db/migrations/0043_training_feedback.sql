CREATE TABLE IF NOT EXISTS "training_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "module_id" uuid,
  "source_run_id" uuid,
  "source_trace_id" uuid,
  "mutation_class" text NOT NULL,
  "delta" jsonb NOT NULL,
  "applied_control_snapshot_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_feedback" ADD CONSTRAINT "training_feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_feedback" ADD CONSTRAINT "training_feedback_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_feedback" ADD CONSTRAINT "training_feedback_applied_control_snapshot_id_control_snapshots_id_fk" FOREIGN KEY ("applied_control_snapshot_id") REFERENCES "public"."control_snapshots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_feedback_company_idx" ON "training_feedback" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_feedback_snapshot_idx" ON "training_feedback" USING btree ("applied_control_snapshot_id");
