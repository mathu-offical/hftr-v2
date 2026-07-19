-- D-140: Engine Data Hub ownership + nest parent on libraries
ALTER TABLE "libraries" ADD COLUMN IF NOT EXISTS "is_engine_data_hub" boolean DEFAULT false NOT NULL;
ALTER TABLE "libraries" ADD COLUMN IF NOT EXISTS "owner_engine_instance_id" uuid;
ALTER TABLE "libraries" ADD COLUMN IF NOT EXISTS "parent_hub_library_id" uuid;

DO $$ BEGIN
  ALTER TABLE "libraries"
    ADD CONSTRAINT "libraries_owner_engine_instance_id_engine_instances_id_fk"
    FOREIGN KEY ("owner_engine_instance_id") REFERENCES "engine_instances"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "libraries"
    ADD CONSTRAINT "libraries_parent_hub_library_id_libraries_id_fk"
    FOREIGN KEY ("parent_hub_library_id") REFERENCES "libraries"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "libraries_owner_engine_idx" ON "libraries" ("owner_engine_instance_id");
CREATE INDEX IF NOT EXISTS "libraries_parent_hub_idx" ON "libraries" ("parent_hub_library_id");
