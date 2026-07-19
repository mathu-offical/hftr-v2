/**
 * Paper trading system API integration probe (D-122).
 * Run against DEV_AUTH_BYPASS=1 server:
 *   pnpm --filter @hftr/web exec tsx scripts/paper-system-verify.ts
 */
const BASE = process.env.HFTR_BASE_URL ?? 'http://127.0.0.1:3001';

type Json = Record<string, unknown>;

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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type Trace = {
  outcome: string;
  venue?: string;
  mode?: string;
  symbol?: string;
  failureCode?: string | null;
  simulatorGapTags?: string[];
  fills?: Array<{ qtyInt: string }>;
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

async function main() {
  const results: Array<{ check: string; ok: boolean; detail: string }> = [];
  const record = (check: string, ok: boolean, detail: string) => {
    results.push({ check, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}: ${detail}`);
  };

  const name = `Paper verify ${Date.now()}`;
  const create = await req('POST', '/api/companies', {
    name,
    philosophyPrompt: 'Paper system verification cohort.',
    mode: 'paper',
    seedCreditsCents: 1_000_000,
    engines: [{ templateId: 'engine_day_trading', inputs: {} }],
  });
  assert(create.status < 300, `create company ${create.status} ${JSON.stringify(create.json)}`);
  const companyId = (create.json.company as { id: string }).id;
  record('create_company', true, companyId);

  const detail = await req('GET', `/api/companies/${companyId}`);
  const modules = (detail.json.modules as Array<{ id: string; type: string; config: Json }>) ?? [];
  const trading = modules.find((m) => m.type === 'trading');
  const trend = modules.find((m) => m.type === 'trend');
  assert(trading && trend, 'missing trading/trend modules');
  record('modules_present', true, `trading=${trading!.id} trend=${trend!.id}`);

  const tradingPatch = await req('PATCH', `/api/companies/${companyId}/modules/${trading!.id}`, {
    status: 'active',
    setup: {
      topicSectors: ['Large-cap technology'],
      capitalAllocation: { mode: 'percentage', value: '25' },
      targetExitAt: '2099-01-02T15:30:00.000Z',
      timezone: 'America/New_York',
    },
    config: {
      subtype: 'day',
      strategyFamilies: [],
      exitTimelineDays: 1,
      cadenceMinutes: 5,
      manualControl: false,
      executionBinding: {
        routingMode: 'funds_only',
        brokerConnectionId: null,
        useProviderLedgerAsFundsSource: true,
      },
    },
  });
  record(
    'patch_execution_binding',
    tradingPatch.status < 300,
    `status=${tradingPatch.status}`,
  );

  const trendPatch = await req('PATCH', `/api/companies/${companyId}/modules/${trend!.id}`, {
    status: 'active',
    setup: { topicSectors: ['Large-cap technology'] },
  });
  record('activate_trend', trendPatch.status < 300, `status=${trendPatch.status}`);

  const modGet = await req('GET', `/api/companies/${companyId}/modules/${trading!.id}`);
  const cfg = (modGet.json.module as { config?: Json })?.config ?? {};
  const binding = cfg.executionBinding as Json | undefined;
  record(
    'binding_persisted',
    binding?.routingMode === 'funds_only',
    JSON.stringify(binding ?? null),
  );

  // qty=1 fills inline (no time-spaced drain); tags should include funds_only honesty.
  const trade = await req('POST', `/api/companies/${companyId}/modules/${trading!.id}/trade`, {
    symbol: 'AAPL',
    actionVerb: 'buy',
    orderType: 'market',
    quantity: 1,
  });
  record(
    'enqueue_operator_trade',
    trade.status < 300,
    `status=${trade.status} ${JSON.stringify(trade.json).slice(0, 200)}`,
  );

  const traces = await drainUntil(
    companyId,
    (t) => t.some((x) => x.outcome === 'filled' && (x.symbol === 'AAPL' || !x.symbol)),
    60_000,
  );
  const filled = traces.find((t) => t.outcome === 'filled' && (t.symbol === 'AAPL' || !t.symbol));
  record(
    'activity_filled_trace',
    Boolean(filled),
    filled
      ? `venue=${filled.venue} mode=${filled.mode} tags=${JSON.stringify(filled.simulatorGapTags ?? [])}`
      : `traces=${traces.length} outcomes=${traces.map((t) => t.outcome).join(',')}`,
  );

  if (filled) {
    const tags = filled.simulatorGapTags ?? [];
    record(
      'gap_tags_funds_only',
      tags.includes('funds_only_routing') || tags.includes('inline_fill_model'),
      JSON.stringify(tags),
    );
    record('mode_paper', filled.mode === 'paper', String(filled.mode));
    record('venue_paper_sim', filled.venue === 'paper_sim', String(filled.venue));
  }

  // Promote path: trend → trading compile/dispatch → filled (may use child-slice drain).
  const trendCreate = await req('POST', `/api/companies/${companyId}/trends`, {
    moduleId: trend!.id,
    symbol: 'MSFT',
    direction: 'up',
    strengthBand: 'strong',
  });
  record('create_trend', trendCreate.status < 300, `status=${trendCreate.status}`);
  const trendId = (trendCreate.json.trend as { id?: string } | undefined)?.id;
  const promote = await req('POST', `/api/companies/${companyId}/modules/${trend!.id}/promote`, {
    trendId,
    targetModuleId: trading!.id,
  });
  record('promote_trend', promote.status < 300, `status=${promote.status}`);
  const promoteTraces = await drainUntil(
    companyId,
    (t) =>
      t.some(
        (x) =>
          x.outcome === 'filled' &&
          (x.symbol === 'MSFT' || (x.fills?.length ?? 0) > 0) &&
          (x.simulatorGapTags ?? []).some(
            (tag) => tag === 'child_slice_drain' || tag === 'no_partial_fills' || tag === 'funds_only_routing',
          ),
      ) || t.filter((x) => x.outcome === 'filled').length >= 2,
    180_000,
  );
  const promoteFilled = promoteTraces.filter((t) => t.outcome === 'filled');
  record(
    'promote_filled_trace',
    promoteFilled.length >= 2 ||
      promoteFilled.some((t) => t.symbol === 'MSFT' || (t.fills?.length ?? 0) > 0),
    `filled_count=${promoteFilled.length} outcomes=${promoteTraces.map((t) => t.outcome).join(',')}`,
  );

  // Elevate to execute_on_service without broker → fail-closed block
  const elevate = await req('PATCH', `/api/companies/${companyId}/modules/${trading!.id}`, {
    config: {
      ...cfg,
      executionBinding: {
        routingMode: 'execute_on_service',
        brokerConnectionId: null,
        useProviderLedgerAsFundsSource: true,
      },
    },
  });
  record('elevate_routing_mode', elevate.status < 300, `status=${elevate.status}`);

  const trade2 = await req('POST', `/api/companies/${companyId}/modules/${trading!.id}/trade`, {
    symbol: 'MSFT',
    actionVerb: 'buy',
    orderType: 'market',
    quantity: 1,
  });
  record('enqueue_elevated_trade', trade2.status < 300, `status=${trade2.status}`);

  const traces2 = await drainUntil(
    companyId,
    (t) =>
      t.some(
        (x) =>
          (x.outcome === 'blocked' || x.outcome === 'rejected') &&
          (x.symbol === 'MSFT' || x.failureCode === 'broker_policy_block'),
      ),
    60_000,
  );
  const blocked = traces2.filter(
    (t) =>
      (t.outcome === 'blocked' || t.outcome === 'rejected') &&
      (t.symbol === 'MSFT' || t.failureCode === 'broker_policy_block'),
  );
  record(
    'elevate_without_service_blocks',
    blocked.length > 0,
    `blocked=${blocked.length} codes=${blocked.map((b) => b.failureCode).join(',')}`,
  );

  const broker = await req('GET', `/api/companies/${companyId}/broker`);
  record('broker_status', broker.status < 300, JSON.stringify(broker.json).slice(0, 220));

  // Desk funds live on broker status + credit ledger (no standalone /funds route).
  const virtual = (broker.json as { virtualBalanceCents?: string }).virtualBalanceCents;
  record(
    'virtual_balance_projected',
    typeof virtual === 'string' && BigInt(virtual) > 0n,
    `virtualBalanceCents=${virtual ?? 'missing'}`,
  );

  await req('DELETE', `/api/companies/${companyId}`);

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== SUMMARY ===');
  console.log(`passed=${results.length - failed.length} failed=${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(` - ${f.check}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
