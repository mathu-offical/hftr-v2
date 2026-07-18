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
  "capability" text NOT NULL,
  "broker_connection_id" uuid REFERENCES "broker_connections"("id"),
  "user_api_key_id" uuid REFERENCES "user_api_keys"("id"),
  "status" text NOT NULL DEFAULT 'bound',
  "last_verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "module_service_bindings_source_xor" CHECK (
    (
      ("broker_connection_id" IS NOT NULL AND "user_api_key_id" IS NULL)
      OR ("broker_connection_id" IS NULL AND "user_api_key_id" IS NOT NULL)
    )
  ),
  CONSTRAINT "module_service_bindings_status_check" CHECK (
    "status" IN ('bound', 'stale', 'missing', 'revoked')
  )
);

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
