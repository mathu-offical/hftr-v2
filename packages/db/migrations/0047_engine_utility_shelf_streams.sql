-- D-216: allow multiple data_out streams from the same hub module (per-shelf outs).
-- Unique key includes stream_id so shelf:{origin}:{stream} can coexist.
DROP INDEX IF EXISTS "engine_utility_links_bus_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "engine_utility_links_bus_stream_unique"
  ON "engine_utility_links" (
    "to_engine_id",
    "bus",
    COALESCE("from_engine_id"::text, ''),
    COALESCE("from_module_id"::text, ''),
    COALESCE("stream_id", '')
  );
