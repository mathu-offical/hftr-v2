ALTER TABLE "modules" ADD COLUMN "generated_name_base" text;--> statement-breakpoint
UPDATE "modules" SET "generated_name_base" = "name";--> statement-breakpoint
ALTER TABLE "modules" ALTER COLUMN "generated_name_base" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "name_customized" boolean;--> statement-breakpoint
UPDATE "modules" SET "name_customized" = true;--> statement-breakpoint
ALTER TABLE "modules" ALTER COLUMN "name_customized" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "modules" ALTER COLUMN "name_customized" SET NOT NULL;