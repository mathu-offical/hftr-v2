CREATE TABLE IF NOT EXISTS "action_traces_archive" (
	"id" uuid PRIMARY KEY NOT NULL,
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
	"created_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_messages_archive" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_results" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_edits_archive" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"tool" text NOT NULL,
	"proposal" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_traces_archive_company_idx" ON "action_traces_archive" ("company_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_messages_archive_company_idx" ON "assistant_messages_archive" ("company_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_edits_archive_company_idx" ON "assistant_edits_archive" ("company_id", "created_at");
