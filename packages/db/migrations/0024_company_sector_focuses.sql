ALTER TABLE "companies" ADD COLUMN "sector_focuses" text[] DEFAULT '{}'::text[] NOT NULL;
