-- D-093: bind research gather keys as service sources (research_provider).
-- Extends module_service_bindings with user_research_key_id and source_kind value.

ALTER TABLE "module_service_bindings"
  ADD COLUMN IF NOT EXISTS "user_research_key_id" uuid
  REFERENCES "user_research_keys"("id");

-- Drop prior XOR / source_kind checks so we can widen them.
ALTER TABLE "module_service_bindings" DROP CONSTRAINT IF EXISTS "module_service_bindings_source_xor";
ALTER TABLE "module_service_bindings" DROP CONSTRAINT IF EXISTS "module_service_bindings_source_kind_check";

ALTER TABLE "module_service_bindings"
  ADD CONSTRAINT "module_service_bindings_source_kind_check" CHECK (
    "source_kind" IN ('broker_connection', 'user_api_key', 'user_research_key')
  );

ALTER TABLE "module_service_bindings"
  ADD CONSTRAINT "module_service_bindings_source_xor" CHECK (
    (
      "broker_connection_id" IS NOT NULL
      AND "user_api_key_id" IS NULL
      AND "user_research_key_id" IS NULL
      AND "source_kind" = 'broker_connection'
    )
    OR (
      "broker_connection_id" IS NULL
      AND "user_api_key_id" IS NOT NULL
      AND "user_research_key_id" IS NULL
      AND "source_kind" = 'user_api_key'
    )
    OR (
      "broker_connection_id" IS NULL
      AND "user_api_key_id" IS NULL
      AND "user_research_key_id" IS NOT NULL
      AND "source_kind" = 'user_research_key'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS "module_service_bindings_research_unique"
  ON "module_service_bindings" ("module_id", "capability", "user_research_key_id")
  WHERE "user_research_key_id" IS NOT NULL;
