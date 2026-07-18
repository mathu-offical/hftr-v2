import fs from 'node:fs';
import { gt } from 'drizzle-orm';
import { getDb } from '@hftr/db';
import { positions } from '@hftr/db/schema';
import {
  createSystemClock,
  defaultLoadAlpacaPaperCredentials,
  refreshAtrStreamForCompany,
} from '@hftr/engine';

/** Cap Alpaca bar calls during soak (owner fallback can hit many desks). */
const MAX_COMPANIES = 3;

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
    .limit(50);
  const companyIds = [...new Set(open.map((o) => o.companyId))];
  console.log(
    'companies_with_open',
    companyIds.slice(0, 10),
    'symbols',
    open.map((o) => o.symbol).slice(0, 20),
  );

  let anyRefreshed = false;
  for (const companyId of companyIds.slice(0, MAX_COMPANIES)) {
    const creds = await defaultLoadAlpacaPaperCredentials(db, companyId);
    console.log(
      JSON.stringify({
        companyId,
        hasCredentials: Boolean(creds),
      }),
    );
    const result = await refreshAtrStreamForCompany(db, clock, companyId);
    console.log(JSON.stringify({ companyId, result }));
    if (result.refreshed > 0) anyRefreshed = true;
  }

  if (!anyRefreshed) {
    console.log('NO_REFRESH');
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
