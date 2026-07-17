import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@hftr/db';

export const dynamic = 'force-dynamic';

/** Public liveness probe: app up, db reachable (degrades gracefully). */
export async function GET() {
  let dbOk = false;
  try {
    await getDb().execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json(
    { ok: true, db: dbOk, version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' },
    { status: dbOk ? 200 : 503 },
  );
}
