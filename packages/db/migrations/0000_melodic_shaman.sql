CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"delta_cents" bigint NOT NULL,
	"reason" text NOT NULL,
	"stripe_payment_intent_id" text,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"balance_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_credits_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "users_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_profile_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"philosophy_prompt" text NOT NULL,
	"goals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reinvestment_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scoping_policies" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mode" text DEFAULT 'paper' NOT NULL,
	"seed_credits_cents" bigint DEFAULT 0 NOT NULL,
	"broker_connection_id" uuid,
	"auto_fund_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_kind" text NOT NULL,
	"from_module_id" uuid,
	"to_kind" text NOT NULL,
	"to_module_id" uuid,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_by" text NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_module_id" uuid NOT NULL,
	"to_module_id" uuid NOT NULL,
	"link_kind" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config_schema_version" text DEFAULT '1' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"allocation_cents" bigint DEFAULT 0 NOT NULL,
	"canvas_position" jsonb DEFAULT '{"x":0,"y":0}'::jsonb NOT NULL,
	"philosophy_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cron_expr" text NOT NULL,
	"queue_class" text NOT NULL,
	"kind" text NOT NULL,
	"payload_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"company_id" uuid,
	"module_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_materialized_window" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_class" text NOT NULL,
	"kind" text NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"locked_by" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"company_id" uuid,
	"module_id" uuid,
	"cost_estimate" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"provider" text NOT NULL,
	"window_minutes" integer NOT NULL,
	"max_calls" integer NOT NULL,
	"max_cost_cents" integer NOT NULL,
	"consumed_calls" integer DEFAULT 0 NOT NULL,
	"consumed_cost_cents" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tier" text NOT NULL,
	"company_id" uuid,
	"module_id" uuid,
	"job_id" uuid,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"schema_valid" boolean NOT NULL,
	"leak_lint_passed" boolean NOT NULL,
	"rate_limit_remaining" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calc_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"op_kind" text NOT NULL,
	"op_name" text NOT NULL,
	"formula_version" text NOT NULL,
	"input_refs" text[] NOT NULL,
	"output_ref" text,
	"sanity_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"job_id" uuid,
	"tier" text,
	"module_id" uuid,
	"duration_us" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue" text NOT NULL,
	"session_date" date NOT NULL,
	"timezone" text NOT NULL,
	"open_ms_utc" bigint,
	"close_ms_utc" bigint,
	"is_holiday" text DEFAULT 'open' NOT NULL,
	"catalog_version" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "numeric_values" (
	"ref" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"unit" text NOT NULL,
	"scale" integer DEFAULT 0 NOT NULL,
	"value_int" bigint NOT NULL,
	"timezone" text,
	"source_class" text NOT NULL,
	"source_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"ttl_ms" bigint NOT NULL,
	"parent_refs" text[] DEFAULT '{}' NOT NULL,
	"sanity_envelope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"company_id" uuid,
	"module_id" uuid,
	"lineage_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fund_transfers" ADD CONSTRAINT "fund_transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_links" ADD CONSTRAINT "module_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_links" ADD CONSTRAINT "module_links_from_module_id_modules_id_fk" FOREIGN KEY ("from_module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_links" ADD CONSTRAINT "module_links_to_module_id_modules_id_fk" FOREIGN KEY ("to_module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_user_idx" ON "credit_ledger" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "companies_owner_idx" ON "companies" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "fund_transfers_company_idx" ON "fund_transfers" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "module_links_company_idx" ON "module_links" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "module_links_unique_edge" ON "module_links" USING btree ("from_module_id","to_module_id","link_kind");--> statement-breakpoint
CREATE INDEX "modules_company_idx" ON "modules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_schedules_enabled_idx" ON "job_schedules" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_unique" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","queue_class","run_after","priority");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_budgets_scope_unique" ON "llm_budgets" USING btree ("scope","scope_id","provider");--> statement-breakpoint
CREATE INDEX "llm_calls_company_idx" ON "llm_calls" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "calc_operations_module_idx" ON "calc_operations" USING btree ("module_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_calendars_venue_date_unique" ON "exchange_calendars" USING btree ("venue","session_date");--> statement-breakpoint
CREATE INDEX "numeric_values_company_kind_idx" ON "numeric_values" USING btree ("company_id","kind","captured_at");--> statement-breakpoint
CREATE INDEX "numeric_values_source_idx" ON "numeric_values" USING btree ("source_id");