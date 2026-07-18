import { and, desc, eq } from 'drizzle-orm';
import { VerifiedNormalizedBundle } from '@hftr/contracts';
import { getDb } from '@hftr/db';
import { systemNormalizedViews } from '@hftr/db/schema';
import { createSystemClock, loadLatestValidSeal } from '../src/index.ts';

async function main() {
  const db = getDb();
  const companyId = 'c10b8a04-85d5-4f43-a31f-61af19cd2eab';
  const rows = await db
    .select()
    .from(systemNormalizedViews)
    .where(eq(systemNormalizedViews.companyId, companyId))
    .orderBy(desc(systemNormalizedViews.expiresAt))
    .limit(1);
  console.log('row count', rows.length);
  if (rows[0]) {
    const p = VerifiedNormalizedBundle.safeParse(rows[0].bundle);
    console.log('parse', p.success);
    if (!p.success) console.log(p.error.issues.slice(0, 12));
    else {
      console.log('items', p.data.view.items.length, 'digests', p.data.sourceDigests.length);
      console.log('expires', p.data.expiresAt, 'sealId', p.data.sealId);
    }
  }
  const clock = createSystemClock();
  const seal = await loadLatestValidSeal(db, {
    companyId,
    kind: 'movers_board',
    subjectKey: 'daily',
    nowMs: clock.nowMs(),
  });
  console.log(
    'loadLatestValidSeal',
    seal
      ? {
          title: seal.view.title,
          items: seal.view.items.length,
          corr: seal.corroborationBand,
          reportConceptId: seal.reportConceptId,
        }
      : null,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
