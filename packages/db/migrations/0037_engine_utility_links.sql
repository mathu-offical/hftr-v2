-- D-091: engine motherboard utility links (data_in/out, clock, funds, system_control).

CREATE TABLE IF NOT EXISTS "engine_utility_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "to_engine_id" uuid NOT NULL REFERENCES "engine_instances"("id") ON DELETE CASCADE,
  "bus" text NOT NULL,
  "from_engine_id" uuid REFERENCES "engine_instances"("id") ON DELETE CASCADE,
  "from_module_id" uuid REFERENCES "modules"("id") ON DELETE CASCADE,
  "stream_id" text,
  "stream_descriptor" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "engine_utility_links_bus_check" CHECK (
    "bus" IN ('data_in', 'data_out', 'clock', 'funds', 'system_control')
  ),
  CONSTRAINT "engine_utility_links_from_xor" CHECK (
    (
      ("from_engine_id" IS NOT NULL AND "from_module_id" IS NULL)
      OR ("from_engine_id" IS NULL AND "from_module_id" IS NOT NULL)
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "engine_utility_links_bus_unique"
  ON "engine_utility_links" ("to_engine_id", "bus", "from_engine_id", "from_module_id");

CREATE INDEX IF NOT EXISTS "engine_utility_links_company_idx"
  ON "engine_utility_links" ("company_id");

CREATE INDEX IF NOT EXISTS "engine_utility_links_to_engine_idx"
  ON "engine_utility_links" ("to_engine_id");

CREATE INDEX IF NOT EXISTS "engine_utility_links_from_engine_idx"
  ON "engine_utility_links" ("from_engine_id")
  WHERE "from_engine_id" IS NOT NULL;
