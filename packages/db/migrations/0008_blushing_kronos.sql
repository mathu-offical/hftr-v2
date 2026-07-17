ALTER TABLE "modules" ADD COLUMN "topic_sectors" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "capital_allocation_ref" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "target_exit_ref" text;