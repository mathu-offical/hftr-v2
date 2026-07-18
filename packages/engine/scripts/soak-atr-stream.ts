import fs from 'node:fs';
import { gt } from 'drizzle-orm';
import { getDb } from '@hftr/db';
import { positions } from '@hftr/db/schema';
import { createSystemClock, refreshAtrStreamForCompany } from '@hftr/engine';

function loadEnv() {
  for (const p of ['../../apps/web/.env.local', '../../.env.local']) {
    try {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        let v = m[2]!.trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (!process.env[m[1]!]) process.env[m[1]!] = v;
      }
    } catch {
      /* missing */
    }
  }
}

async function main() {
  loadEnv();
  const db = getDb();
  const clock = createSystemClock();
  const open = await db
    .select({ companyId: positions.companyId, symbol: positions.symbol })
    .from(positions)
    .where(gt(positions.qty, 0n))
    .limit(20);
  const companyIds = [...new Set(open.map((o) => o.companyId))];
  console.log(
    'companies_with_open',
    companyIds.slice(0, 5),
    'symbols',
    open.map((o) => o.symbol).slice(0, 10),
  );
  const companyId = companyIds[0];
  if (!companyId) {
    console.log('NO_COMPANY');
    return;
  }
  const result = await refreshAtrStreamForCompany(db, clock, companyId);
  console.log(JSON.stringify({ companyId, result }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
