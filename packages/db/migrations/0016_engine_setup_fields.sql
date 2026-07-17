-- D-035: persist full ENGINE setup (allocation envelope, overall exit, template inputs)
ALTER TABLE "engine_instances" ADD COLUMN "capital_allocation_ref" text;
ALTER TABLE "engine_instances" ADD COLUMN "target_exit_ref" text;
ALTER TABLE "engine_instances" ADD COLUMN "setup_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "engine_instances" ADD COLUMN "template_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Backfill topic into snapshot for existing engines so group chrome can hydrate.
UPDATE "engine_instances"
SET "setup_snapshot" = jsonb_build_object(
  'topicSectors', COALESCE("master_topic_sectors", ARRAY[]::text[]),
  'allocationMode', 'amount',
  'allocationValue', '',
  'targetExitLocal', ''
)
WHERE "setup_snapshot" = '{}'::jsonb;
