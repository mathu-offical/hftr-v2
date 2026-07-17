-- D-040: topic membership, hybrid synopsis, usage telemetry, primary library
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "primary_library_id" uuid;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "query_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "last_queried_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "reference_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "last_referenced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "synopsis_md" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "query_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "last_queried_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "reference_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "last_referenced_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "concepts" ADD CONSTRAINT "concepts_primary_library_id_libraries_id_fk" FOREIGN KEY ("primary_library_id") REFERENCES "public"."libraries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_concepts" ADD CONSTRAINT "topic_concepts_topic_id_research_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."research_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_concepts" ADD CONSTRAINT "topic_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "topic_concepts_unique" ON "topic_concepts" USING btree ("topic_id","concept_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_concepts_topic_idx" ON "topic_concepts" USING btree ("topic_id","sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_concepts_concept_idx" ON "topic_concepts" USING btree ("concept_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_primary_library_idx" ON "concepts" USING btree ("primary_library_id");
--> statement-breakpoint
-- Backfill primary_library_id from earliest library_concepts membership per concept
UPDATE "concepts" c
SET "primary_library_id" = sub.library_id
FROM (
  SELECT DISTINCT ON (lc.concept_id) lc.concept_id, lc.library_id
  FROM library_concepts lc
  ORDER BY lc.concept_id, lc.created_at ASC
) sub
WHERE c.id = sub.concept_id AND c.primary_library_id IS NULL;
