CREATE TABLE "broker_balances_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"cash_cents" bigint NOT NULL,
	"buying_power_cents" bigint NOT NULL,
	"positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"venue" text NOT NULL,
	"mode" text DEFAULT 'paper' NOT NULL,
	"ciphertext" text NOT NULL,
	"key_hint" text NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"capabilities" jsonb,
	"last_verified_at" timestamp with time zone,
	"venue_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_reconciliation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connection_id" uuid,
	"client_order_id" text,
	"venue_order_id" text,
	"event_kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"company_id" uuid,
	"schema_ref" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"output" jsonb NOT NULL,
	"llm_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_concept_id" uuid NOT NULL,
	"to_concept_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"weight_band" text DEFAULT 'typical' NOT NULL,
	"source_class" text DEFAULT 'model_generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD COLUMN "retention_attested" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "llm_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "retention_class" text;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "broker_balances_snapshot" ADD CONSTRAINT "broker_balances_snapshot_connection_id_broker_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."broker_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_reconciliation_events" ADD CONSTRAINT "dispatch_reconciliation_events_connection_id_broker_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."broker_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_links" ADD CONSTRAINT "concept_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_links" ADD CONSTRAINT "concept_links_from_concept_id_concepts_id_fk" FOREIGN KEY ("from_concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_links" ADD CONSTRAINT "concept_links_to_concept_id_concepts_id_fk" FOREIGN KEY ("to_concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broker_balances_connection_idx" ON "broker_balances_snapshot" USING btree ("connection_id","as_of");--> statement-breakpoint
CREATE INDEX "broker_connections_user_idx" ON "broker_connections" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "broker_connections_user_venue_mode_unique" ON "broker_connections" USING btree ("clerk_user_id","venue","mode");--> statement-breakpoint
CREATE INDEX "dispatch_recon_company_idx" ON "dispatch_reconciliation_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "dispatch_recon_client_order_idx" ON "dispatch_reconciliation_events" USING btree ("client_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_artifacts_idempotency_unique" ON "llm_artifacts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "concept_links_company_idx" ON "concept_links" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_links_unique_edge" ON "concept_links" USING btree ("from_concept_id","to_concept_id","relation");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_broker_connection_id_broker_connections_id_fk" FOREIGN KEY ("broker_connection_id") REFERENCES "public"."broker_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_broker_connection_unique" ON "companies" USING btree ("broker_connection_id");--> statement-breakpoint
CREATE INDEX "llm_calls_idempotency_idx" ON "llm_calls" USING btree ("idempotency_key");