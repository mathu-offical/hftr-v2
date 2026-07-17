CREATE TABLE "compile_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tree_id" uuid NOT NULL,
	"result" text NOT NULL,
	"block_reason" text,
	"instruction_id" uuid,
	"lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_class" text DEFAULT 'deterministic_placeholder' NOT NULL,
	"source_ref" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_trees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"branches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recovery_ladder" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_class" text DEFAULT 'deterministic_placeholder' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"target_module_id" uuid,
	"trend_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"strategy_family" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"gates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"control_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compile_events" ADD CONSTRAINT "compile_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_events" ADD CONSTRAINT "compile_events_tree_id_decision_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."decision_trees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compile_events" ADD CONSTRAINT "compile_events_instruction_id_action_instructions_id_fk" FOREIGN KEY ("instruction_id") REFERENCES "public"."action_instructions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_trees" ADD CONSTRAINT "decision_trees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_trees" ADD CONSTRAINT "decision_trees_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_trees" ADD CONSTRAINT "decision_trees_lead_id_lead_packages_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_packages" ADD CONSTRAINT "lead_packages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_packages" ADD CONSTRAINT "lead_packages_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_packages" ADD CONSTRAINT "lead_packages_target_module_id_modules_id_fk" FOREIGN KEY ("target_module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_packages" ADD CONSTRAINT "lead_packages_trend_id_trend_candidates_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compile_events_company_idx" ON "compile_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "concepts_company_idx" ON "concepts" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "concepts_module_title_unique" ON "concepts" USING btree ("module_id","title");--> statement-breakpoint
CREATE INDEX "decision_trees_company_idx" ON "decision_trees" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_packages_company_idx" ON "lead_packages" USING btree ("company_id","created_at");