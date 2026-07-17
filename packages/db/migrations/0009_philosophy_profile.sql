ALTER TABLE "companies" ADD COLUMN "philosophy_profile" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "decision_trees" ADD COLUMN "lever_state" jsonb DEFAULT '{}'::jsonb NOT NULL;
