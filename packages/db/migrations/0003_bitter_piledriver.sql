CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"bias" text DEFAULT 'neutral' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source_class" text DEFAULT 'operator' NOT NULL,
	"status" text DEFAULT 'watching' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_module_symbol_unique" ON "watchlist_items" USING btree ("module_id","symbol");--> statement-breakpoint
CREATE INDEX "watchlist_items_company_idx" ON "watchlist_items" USING btree ("company_id");