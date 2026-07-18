CREATE TABLE IF NOT EXISTS "book_deltas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "engine_module_id" uuid NOT NULL,
  "instruction_id" uuid,
  "trace_id" uuid,
  "routing_mode" text NOT NULL,
  "delta" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_deltas" ADD CONSTRAINT "book_deltas_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "book_deltas" ADD CONSTRAINT "book_deltas_engine_module_id_modules_id_fk" FOREIGN KEY ("engine_module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_deltas_company_idx" ON "book_deltas" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_deltas_module_idx" ON "book_deltas" USING btree ("engine_module_id","created_at");
