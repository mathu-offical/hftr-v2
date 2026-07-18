import { neon } from '@neondatabase/serverless';

/**
 * Ensures `realized_pnl_events` exists (from migration 0036). Missing table
 * fail-closes every paper dispatch via limits_block on daily-loss query.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const sql = neon(url);
  const before = await sql`select to_regclass('public.realized_pnl_events') as reg`;
  console.log('before', before);
  if (before[0]?.reg) {
    console.log('table exists');
    return;
  }
  await sql.query(`CREATE TABLE IF NOT EXISTS "realized_pnl_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "module_id" uuid NOT NULL REFERENCES "modules"("id"),
  "symbol" text NOT NULL,
  "realized_cents" bigint NOT NULL,
  "trace_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS "realized_pnl_events_company_created_idx"
  ON "realized_pnl_events" ("company_id", "created_at")`);
  const after = await sql`select to_regclass('public.realized_pnl_events') as reg`;
  console.log('created', after);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
