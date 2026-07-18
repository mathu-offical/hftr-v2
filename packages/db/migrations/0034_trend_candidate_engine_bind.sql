-- D-077: per-trend canvas binding to execution engine / trading module
ALTER TABLE "trend_candidates" ADD COLUMN IF NOT EXISTS "engine_instance_id" uuid;
--> statement-breakpoint
ALTER TABLE "trend_candidates" ADD COLUMN IF NOT EXISTS "trading_module_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_candidates" ADD CONSTRAINT "trend_candidates_engine_instance_id_engine_instances_id_fk" FOREIGN KEY ("engine_instance_id") REFERENCES "public"."engine_instances"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_candidates" ADD CONSTRAINT "trend_candidates_trading_module_id_modules_id_fk" FOREIGN KEY ("trading_module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_candidates_module_idx" ON "trend_candidates" ("module_id","status");
