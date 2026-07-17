CREATE TABLE IF NOT EXISTS "engine_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"label" text NOT NULL,
	"master_topic_sectors" text[] DEFAULT '{}' NOT NULL,
	"canvas_bounds" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "engine_instances" ADD CONSTRAINT "engine_instances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engine_instances_company_idx" ON "engine_instances" USING btree ("company_id");
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "topic_sectors_overridden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "engine_instance_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "modules" ADD CONSTRAINT "modules_engine_instance_id_engine_instances_id_fk" FOREIGN KEY ("engine_instance_id") REFERENCES "public"."engine_instances"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modules_engine_instance_idx" ON "modules" USING btree ("engine_instance_id");
--> statement-breakpoint
-- Backfill day_trading_starter-shaped graphs: exactly one of each starter type, Math excluded.
WITH candidate AS (
  SELECT m.company_id
  FROM modules m
  WHERE m.type <> 'math'
  GROUP BY m.company_id
  HAVING
    COUNT(*) FILTER (WHERE m.type = 'research') = 1
    AND COUNT(*) FILTER (WHERE m.type = 'library') = 1
    AND COUNT(*) FILTER (WHERE m.type = 'live_api') = 1
    AND COUNT(*) FILTER (WHERE m.type = 'trend') = 1
    AND COUNT(*) FILTER (WHERE m.type = 'trading') = 1
    AND COUNT(*) FILTER (WHERE m.type = 'holding_fund') = 1
    AND COUNT(*) FILTER (WHERE m.type = 'fund_router') = 1
    AND COUNT(*) FILTER (WHERE m.type = 'analyzer') = 1
    AND COUNT(*) FILTER (WHERE m.type = 'policy') = 1
    AND COUNT(*) = 9
    AND COUNT(*) FILTER (WHERE m.engine_instance_id IS NOT NULL) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM engine_instances ei
      WHERE ei.company_id = m.company_id
    )
),
inserted AS (
  INSERT INTO engine_instances (company_id, template_id, label, master_topic_sectors)
  SELECT
    c.company_id,
    'engine_day_trading',
    'Day trading engine',
    COALESCE(
      (
        SELECT m.topic_sectors
        FROM modules m
        WHERE m.company_id = c.company_id
          AND m.type <> 'math'
          AND cardinality(m.topic_sectors) > 0
        ORDER BY m.created_at ASC
        LIMIT 1
      ),
      '{}'::text[]
    )
  FROM candidate c
  RETURNING id, company_id
)
UPDATE modules m
SET engine_instance_id = i.id
FROM inserted i
WHERE m.company_id = i.company_id
  AND m.type <> 'math';
