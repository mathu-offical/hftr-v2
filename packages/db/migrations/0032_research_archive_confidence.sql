-- D-047: research soft-delete archive timestamps + qualitative confidence bands
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "confidence_band" text DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "confidence_band" text DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "libraries" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
