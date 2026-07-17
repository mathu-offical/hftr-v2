import { NextResponse } from 'next/server';
import { getDb } from '@hftr/db';
import { createSystemClock, drainQueues } from '@hftr/engine';
import { createOwnerScopedModelGateway } from '@/lib/model-gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel cron entry point (job-orchestration.md). Not Clerk-protected — the
 * cron runner authenticates with CRON_SECRET as a bearer token. Fails closed
 * if the secret is missing or wrong.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const clock = createSystemClock();
  const workerId = `vercel:${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}:${clock.nowMs()}`;
  try {
    const db = getDb();
    const result = await drainQueues(db, clock, {
      workerId,
      budgetMs: 45_000, // leave headroom inside maxDuration
      modelGateway: createOwnerScopedModelGateway(db),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('drain failed', err);
    return NextResponse.json({ error: 'drain_failed' }, { status: 500 });
  }
}
