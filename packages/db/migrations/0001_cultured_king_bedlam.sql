CREATE TABLE "action_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"action_verb" text NOT NULL,
	"symbol" text NOT NULL,
	"order_type" text NOT NULL,
	"time_in_force" text NOT NULL,
	"quantity_ref" text NOT NULL,
	"limit_price_ref" text,
	"stop_price_ref" text,
	"fill_timeout_ref" text NOT NULL,
	"guardrail_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_schema_version" text NOT NULL,
	"client_order_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"envelope" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"company_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"venue" text NOT NULL,
	"mode" text NOT NULL,
	"outcome" text NOT NULL,
	"fills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"simulator_gap_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"session_legality_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_envelope_version" text NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deterministic_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instruction_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"venue_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"balance_after_cents" bigint NOT NULL,
	"trace_id" uuid,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid,
	"task_id" uuid,
	"result" text NOT NULL,
	"field_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_code" text,
	"recovery_protocol_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_instructions" ADD CONSTRAINT "action_instructions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_instructions" ADD CONSTRAINT "action_instructions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deterministic_tasks" ADD CONSTRAINT "deterministic_tasks_instruction_id_action_instructions_id_fk" FOREIGN KEY ("instruction_id") REFERENCES "public"."action_instructions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_instructions_client_order_unique" ON "action_instructions" USING btree ("client_order_id");--> statement-breakpoint
CREATE INDEX "action_instructions_company_idx" ON "action_instructions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "action_traces_company_idx" ON "action_traces" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deterministic_tasks_idempotency_unique" ON "deterministic_tasks" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_entries_company_idx" ON "ledger_entries" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "verification_records_trace_idx" ON "verification_records" USING btree ("trace_id");