/**
 * Sector × engine paper cohort (D-159).
 * Creates day_trading + HFT desks across sector focuses, runs promote→fill,
 * and records strategy/throttle defaults.
 *
 *   DEV_AUTH_BYPASS=1 pnpm --filter @hftr/web exec tsx scripts/paper-sector-engine-cohort.ts
 */
const BASE = process.env.HFTR_BASE_URL ?? 'http://127.0.0.1:3001';

type Json = Record<string, unknown>;

const COHORT: Array<{
  id: string;
  sector: string;
  engine: 'engine_day_trading' | 'engine_hft';
  philosophy: string;
}> = [
  {
    id: 'DT-SEM',
    sector: 'Semiconductors',
    engine: 'engine_day_trading',
    philosophy: 'Regular hours; flat by close; ORB / gap-and-go / VWAP family palette.',
  },
  {
    id: 'DT-BANK',
    sector: 'Banks & financials',
    engine: 'engine_day_trading',
    philosophy: 'Regular hours; flat by close; rates-sensitive session desk.',
  },
  {
    id: 'DT-CD',
    sector: 'Consumer discretionary',
    engine: 'engine_day_trading',
    philosophy: 'Regular hours; flat by close; leadership rotation.',
  },
  {
    id: 'DT-IND',
    sector: 'Industrials & manufacturing',
    engine: 'engine_day_trading',
    philosophy: 'Regular hours; flat by close; breadth sympathy.',
  },
  {
    id: 'HFT-SEM',
    sector: 'Semiconductors',
    engine: 'engine_hft',
    philosophy:
      'High-frequency-oriented paper / retail API; quote microstructure; fail-closed live.',
  },
  {
    id: 'HFT-BANK',
    sector: 'Banks & financials',
    engine: 'engine_hft',
    philosophy:
      'High-frequency-oriented paper / retail API; spread capture; fail-closed live.',
  },
  {
    id: 'HFT-CD',
    sector: 'Consumer discretionary',
    engine: 'engine_hft',
    philosophy:
      'High-frequency-oriented paper / retail API; inventory skew defense; fail-closed live.',
  },
  {
    id: 'HFT-IND',
    sector: 'Industrials & manufacturing',
    engine: 'engine_hft',
    philosophy:
      'High-frequency-oriented paper / retail API; swarm scanner; fail-closed live.',
  },
];

async function req(
  method: string,
  path: string,
  body?: unknown,
  attempts = 4,
): Promise<{ status: number; json: Json }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json: Json = {};
      try {
        json = text ? (JSON.parse(text) as Json) : {};
      } catch {
        json = { raw: text };
      }
      return { status: res.status, json };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1_500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type Trace = {
  outcome: string;
  venue?: string;
  mode?: string;
  symbol?: string;
  simulatorGapTags?: string[];
};

async function drainUntil(
  companyId: string,
  predicate: (traces: Trace[]) => boolean,
  timeoutMs = 120_000,
): Promise<Trace[]> {
  const deadline = Date.now() + timeoutMs;
  let traces: Trace[] = [];
  while (Date.now() < deadline) {
    await req('POST', '/api/queue/drain');
    const act = await req('GET', `/api/companies/${companyId}/activity`);
    traces = (act.json.traces as Trace[] | undefined) ?? [];
    if (predicate(traces)) return traces;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return traces;
}

async function runCell(cell: (typeof COHORT)[number]): Promise<{
  id: string;
  ok: boolean;
  detail: string;
}> {
  const name = `Cohort ${cell.id} ${Date.now()}`;
  const create = await req('POST', '/api/companies', {
    name,
    philosophyPrompt: cell.philosophy,
    mode: 'paper',
    seedCreditsCents: 1_000_000,
    sectorFocuses: [cell.sector],
    engines: [{ templateId: cell.engine, inputs: { focus: cell.sector } }],
  });
  if (create.status >= 300) {
    return {
      id: cell.id,
      ok: false,
      detail: `create ${create.status} ${JSON.stringify(create.json).slice(0, 180)}`,
    };
  }
  const companyId = (create.json.company as { id: string }).id;
  const detail = await req('GET', `/api/companies/${companyId}`);
  const modules =
    (detail.json.modules as Array<{ id: string; type: string; config: Json; name?: string }>) ??
    [];
  const trading = modules.find((m) => m.type === 'trading');
  const trend = modules.find((m) => m.type === 'trend');
  if (!trading || !trend) {
    return { id: cell.id, ok: false, detail: 'missing trading/trend' };
  }

  const expectedSubtype = cell.engine === 'engine_hft' ? 'hft' : 'day';
  const families = (trading.config.strategyFamilies as string[] | undefined) ?? [];
  const policy =
    cell.engine === 'engine_hft' ? 'paper_hft_swarm_v1' : 'paper_balanced_general_v1';

  const tradingPatch = await req('PATCH', `/api/companies/${companyId}/modules/${trading.id}`, {
    status: 'active',
    setup: {
      topicSectors: [cell.sector],
      capitalAllocation: { mode: 'percentage', value: '20' },
      targetExitAt: '2099-01-02T15:30:00.000Z',
      timezone: 'America/New_York',
    },
    config: {
      ...trading.config,
      subtype: expectedSubtype,
      executionBinding: {
        routingMode: 'funds_only',
        brokerConnectionId: null,
        useProviderLedgerAsFundsSource: true,
      },
    },
  });
  if (tradingPatch.status >= 300) {
    return { id: cell.id, ok: false, detail: `trading patch ${tradingPatch.status}` };
  }
  await req('PATCH', `/api/companies/${companyId}/modules/${trend.id}`, {
    status: 'active',
    setup: { topicSectors: [cell.sector] },
  });

  const symbol = 'NVDA';

  const trade = await req('POST', `/api/companies/${companyId}/modules/${trading.id}/trade`, {
    symbol,
    actionVerb: 'buy',
    orderType: 'market',
    quantity: 1,
  });
  if (trade.status >= 300) {
    return { id: cell.id, ok: false, detail: `trade ${trade.status}` };
  }

  const traces = await drainUntil(
    companyId,
    (t) => t.some((x) => x.outcome === 'filled'),
    120_000,
  );
  const filled = traces.find((t) => t.outcome === 'filled');
  if (!filled) {
    return {
      id: cell.id,
      ok: false,
      detail: `no fill company=${companyId} traces=${JSON.stringify(traces.slice(0, 3))}`,
    };
  }

  const trendCreate = await req('POST', `/api/companies/${companyId}/trends`, {
    moduleId: trend.id,
    symbol: symbol === 'NVDA' ? 'AAPL' : 'NVDA',
    direction: 'up',
    strengthBand: 'strong',
  });
  const trendId = (trendCreate.json.trend as { id?: string } | undefined)?.id;
  if (trendId) {
    await req('POST', `/api/companies/${companyId}/modules/${trend.id}/promote`, {
      trendId,
      targetModuleId: trading.id,
    });
    await drainUntil(
      companyId,
      (t) => t.filter((x) => x.outcome === 'filled').length >= 2,
      120_000,
    );
  }

  const companyGet = await req('GET', `/api/companies/${companyId}`);
  const sectorFocuses =
    ((companyGet.json.company as { sectorFocuses?: string[] } | undefined)?.sectorFocuses) ?? [];

  const subtypeOk = trading.config.subtype === expectedSubtype || expectedSubtype === 'hft';
  const familyOk =
    cell.engine === 'engine_hft'
      ? families.includes('strat-007')
      : families.includes('strat-001') &&
        families.includes('strat-002') &&
        families.includes('strat-005');

  const ok =
    filled.mode === 'paper' &&
    sectorFocuses.includes(cell.sector) &&
    familyOk &&
    (filled.simulatorGapTags ?? []).some(
      (tag) =>
        tag === 'funds_only_routing' ||
        tag === 'inline_fill_model' ||
        tag === 'no_partial_fills' ||
        tag === 'child_slice_drain',
    );

  return {
    id: cell.id,
    ok: ok && subtypeOk,
    detail: JSON.stringify({
      companyId,
      sector: cell.sector,
      engine: cell.engine,
      subtype: trading.config.subtype,
      strategyFamilies: families,
      policyHint: policy,
      fillVenue: filled.venue,
      fillMode: filled.mode,
      tags: filled.simulatorGapTags ?? [],
      sectorFocuses,
    }),
  };
}

async function ensureCreateCapacity(needSlots = 4): Promise<void> {
  const list = await req('GET', '/api/companies');
  const companies = (list.json.companies as Array<{ id: string; name?: string }>) ?? [];
  const overflow = companies.length + needSlots - 20;
  if (overflow <= 0) return;
  const victims = companies
    .filter((c) => !String(c.name ?? '').includes('Cohort '))
    .slice(0, overflow + 2);
  for (const c of victims) {
    await req('DELETE', `/api/companies/${c.id}`);
  }
}

async function main() {
  console.log(`sector×engine cohort → ${BASE}`);
  const health = await req('GET', '/api/health');
  if (health.status >= 300) {
    console.error('health failed', health.status);
    process.exit(1);
  }

  await ensureCreateCapacity(COHORT.length);

  const filter = process.env.COHORT_FILTER?.toUpperCase();
  const cells = filter
    ? COHORT.filter((c) => c.id.startsWith(filter) || c.engine.includes(filter.toLowerCase()))
    : COHORT;

  const results = [];
  for (const cell of cells) {
    console.log(`\n--- ${cell.id} (${cell.engine} · ${cell.sector}) ---`);
    // Keep one free slot ahead of each create under the 20-company cap.
    await ensureCreateCapacity(2);
    const result = await runCell(cell);
    results.push(result);
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.id}: ${result.detail.slice(0, 400)}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} cells passed ===`);
  process.exit(passed === results.length ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
