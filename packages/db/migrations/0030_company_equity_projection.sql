ALTER TABLE "companies" ADD COLUMN "equity_cents" bigint;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "equity_ref" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "equity_as_of" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "equity_status" text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "equity_version" integer DEFAULT 0 NOT NULL;
