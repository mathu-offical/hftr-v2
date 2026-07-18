ALTER TABLE "companies" ADD COLUMN "universe_excludes" text[] DEFAULT '{}'::text[] NOT NULL;
