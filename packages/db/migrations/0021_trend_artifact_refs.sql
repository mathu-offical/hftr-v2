ALTER TABLE "trend_candidates" ADD COLUMN IF NOT EXISTS "artifact_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;
