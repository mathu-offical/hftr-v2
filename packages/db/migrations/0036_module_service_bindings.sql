-- D-090: module↔service source bindings + position provenance.
-- Multi-source design: drop exclusive company↔broker unique; keep nullable FK.

ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_broker_connection_unique";
DROP INDEX IF EXISTS "companies_broker_connection_unique";

ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "connection_id" uuid
  REFERENCES "broker_connections"("id");
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "venue" text;

CREATE TABLE IF NOT EXISTS "module_service_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "module_id" uuid NOT NULL REFERENCES "modules"("id"),
  "source_kind" text NOT NULL,
  "capability" text NOT NULL,
  "broker_connection_id" uuid REFERENCES "broker_connections"("id"),
  "user_api_key_id" uuid REFERENCES "user_api_keys"("id"),
  "status" text NOT NULL DEFAULT 'bound',
  "last_verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "module_service_bindings_source_xor" CHECK (
    (
      ("broker_connection_id" IS NOT NULL AND "user_api_key_id" IS NULL AND "source_kind" = 'broker_connection')
      OR ("broker_connection_id" IS NULL AND "user_api_key_id" IS NOT NULL AND "source_kind" = 'user_api_key')
    )
  ),
  CONSTRAINT "module_service_bindings_status_check" CHECK (
    "status" IN ('bound', 'stale', 'missing', 'revoked')
  ),
  CONSTRAINT "module_service_bindings_source_kind_check" CHECK (
    "source_kind" IN ('broker_connection', 'user_api_key')
  )
);

-- Idempotent align for DBs that created the table before source_kind landed.
ALTER TABLE "module_service_bindings" ADD COLUMN IF NOT EXISTS "source_kind" text;
UPDATE "module_service_bindings" SET "source_kind" = 'broker_connection'
  WHERE "source_kind" IS NULL AND "broker_connection_id" IS NOT NULL;
UPDATE "module_service_bindings" SET "source_kind" = 'user_api_key'
  WHERE "source_kind" IS NULL AND "user_api_key_id" IS NOT NULL;
ALTER TABLE "module_service_bindings" ALTER COLUMN "source_kind" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "module_service_bindings_broker_unique"
  ON "module_service_bindings" ("module_id", "capability", "broker_connection_id")
  WHERE "broker_connection_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "module_service_bindings_key_unique"
  ON "module_service_bindings" ("module_id", "capability", "user_api_key_id")
  WHERE "user_api_key_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "module_service_bindings_company_idx"
  ON "module_service_bindings" ("company_id");

CREATE INDEX IF NOT EXISTS "positions_connection_idx"
  ON "positions" ("connection_id");

-- Day-bucket realized PnL for daily-loss limits (D-090). Cash ledger stays cash-only.
CREATE TABLE IF NOT EXISTS "realized_pnl_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "module_id" uuid NOT NULL REFERENCES "modules"("id"),
  "symbol" text NOT NULL,
  "realized_cents" bigint NOT NULL,
  "trace_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "realized_pnl_events_company_created_idx"
  ON "realized_pnl_events" ("company_id", "created_at");
