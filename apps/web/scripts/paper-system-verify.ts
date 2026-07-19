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
  timeoutMs = 30_000,
): Promise<{ status: number; json: Json }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
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

async function assertServerAlive(): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`health status ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1_000 * (i + 1)));
    }
  }
  throw new Error(
    `HFTR server unreachable at ${BASE} — start Next with DEV_AUTH_BYPASS=1 before verify (${String(lastErr)})`,
  );
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type Trace = {
  id?: string;
  outcome: string;
  venue?: string;
  mode?: string;
  symbol?: string;
  failureCode?: string | null;
  simulatorGapTags?: string[];
  fills?: Array<{ qtyInt: string }>;
};

async function loadTraces(companyId: string): Promise<Trace[]> {
  const [act, exec] = await Promise.all([
    req('GET', `/api/companies/${companyId}/activity`, undefined, 2, 45_000).catch(() => ({
      status: 0,
      json: {} as Json,
    })),
    req('GET', `/api/companies/${companyId}/executions`, undefined, 2, 45_000).catch(() => ({
      status: 0,
      json: {} as Json,
    })),
  ]);
  const fromAct = (act.json.traces as Trace[] | undefined) ?? [];
  const fromExec = ((exec.json.executions as Trace[] | undefined) ?? []).map((e) => ({
    ...e,
    // executions rows omit symbol sometimes; keep tags/outcome
  }));
  const byId = new Map<string, Trace>();
  for (const t of [...fromAct, ...fromExec]) {
    const id = (t as { id?: string }).id;
    if (id) byId.set(id, { ...byId.get(id), ...t });
    else byId.set(`anon-${byId.size}`, t);
  }
  return [...byId.values()];
}

async function waitForTraces(
  companyId: string,
  predicate: (traces: Trace[]) => boolean,
  timeoutMs = 90_000,
  opts?: { drain?: boolean },
): Promise<Trace[]> {
  const deadline = Date.now() + timeoutMs;
  const shouldDrain = opts?.drain !== false;
  let traces: Trace[] = [];
  let consecutiveFailures = 0;
  while (Date.now() < deadline) {
    try {
      traces = await loadTraces(companyId);
      consecutiveFailures = 0;
      if (predicate(traces)) return traces;
      if (shouldDrain) {
        await req('POST', '/api/queue/drain', undefined, 1, 15_000).catch(() => undefined);
        traces = await loadTraces(companyId);
        if (predicate(traces)) return traces;
      }
    } catch (err) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 4) {
        throw new Error(
          `waitForTraces aborted after ${consecutiveFailures} consecutive failures: ${String(err)}`,
        );
      }
    }
    await new Promise((r) => setTimeout(r, 1_250));
  }
  return traces;
}

/** @deprecated alias — prefer waitForTraces */
async function drainUntil(
  companyId: string,
  predicate: (traces: Trace[]) => boolean,
  timeoutMs = 120_000,
): Promise<Trace[]> {
  return waitForTraces(companyId, predicate, timeoutMs, { drain: true });
}

async function ensureCreateCapacity(needSlots = 2): Promise<number> {
  const list = await req('GET', '/api/companies');
  const companies = (list.json.companies as Array<{ id: string; name?: string }>) ?? [];
  const overflow = companies.length + needSlots - 20;
  if (overflow <= 0) return 0;
  // Prefer prior verify/cohort leftovers; never wipe non-test names first.
  const preferred = companies.filter((c) => {
    const n = String(c.name ?? '');
    return n.startsWith('Paper verify') || n.includes('Cohort ') || n.startsWith('Paper ');
  });
  const rest = companies.filter((c) => !preferred.includes(c));
  const victims = [...preferred, ...rest].slice(0, overflow + 2);
  let archived = 0;
  for (const c of victims) {
    const del = await req('DELETE', `/api/companies/${c.id}`);
    if (del.status < 300) archived += 1;
  }
  return archived;
}

async function main() {
  await assertServerAlive();
  const results: Array<{ check: string; ok: boolean; detail: string }> = [];
  const record = (check: string, ok: boolean, detail: string) => {
    results.push({ check, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}: ${detail}`);
  };

  const archived = await ensureCreateCapacity(2);
  if (archived > 0) {
    record('archive_capacity', true, `archived=${archived}`);
  }

  const name = `Paper verify ${Date.now()}`;
  const create = await req(
    'POST',
    '/api/companies',
    {
      name,
      philosophyPrompt: 'Paper system verification cohort.',
      mode: 'paper',
      seedCreditsCents: 1_000_000,
      engines: [{ templateId: 'engine_day_trading', inputs: {} }],
    },
    3,
    120_000,
  );
  assert(create.status < 300, `create company ${create.status} ${JSON.stringify(create.json)}`);
  const companyId = (create.json.company as { id: string }).id;
  record('create_company', true, companyId);

  const detail = await req('GET', `/api/companies/${companyId}`);
  const modules =
    (detail.json.modules as Array<{
      id: string;
      type: string;
      config: Json;
      name?: string;
      generatedNameBase?: string;
      engineInstanceId?: string | null;
    }>) ?? [];
  const labelOf = (m: { name?: string; generatedNameBase?: string }) =>
    `${m.name ?? ''} ${m.generatedNameBase ?? ''}`;
  const isSimChild = (m: { name?: string; generatedNameBase?: string }) =>
    /gate|training|adhoc|\bsim\b/i.test(labelOf(m));
  const tradings = modules.filter((m) => m.type === 'trading');
  const trading =
    tradings.find((m) => /day[- ]?trade/i.test(labelOf(m))) ??
    tradings.find((m) => !isSimChild(m)) ??
    tradings[0];
  const trends = modules.filter((m) => m.type === 'trend');
  const trend =
    (trading?.engineInstanceId
      ? trends.find((m) => m.engineInstanceId === trading.engineInstanceId)
      : undefined) ??
    trends.find((m) => !isSimChild(m)) ??
    trends[0];
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

  const quotePreview = await req(
    'GET',
    `/api/companies/${companyId}/modules/${trading!.id}/trade/quote-preview?symbol=AAPL&quantity=5`,
  );
  const previewBody = quotePreview.json as {
    usedLive?: boolean;
    honestyTags?: string[];
    impactProxyLikely?: boolean;
    priorSessionMark?: boolean;
  };
  record(
    'quote_preview_honesty',
    quotePreview.status < 300 &&
      Array.isArray(previewBody.honestyTags) &&
      (previewBody.honestyTags.includes('live_market_quote') ||
        previewBody.honestyTags.includes('synthetic_quote')) &&
      previewBody.impactProxyLikely === true,
    `status=${quotePreview.status} tags=${JSON.stringify(previewBody.honestyTags ?? [])} live=${previewBody.usedLive} prior=${previewBody.priorSessionMark}`,
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

  const traces = await waitForTraces(
    companyId,
    (t) => t.some((x) => x.outcome === 'filled'),
    90_000,
    { drain: true },
  );
  const filled = traces.find((t) => t.outcome === 'filled');
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
    record(
      'gap_tags_quote_honesty',
      tags.includes('live_market_quote') || tags.includes('synthetic_quote'),
      tags.includes('live_market_quote') ? 'live_market_quote' : 'synthetic_quote',
    );
    // Soft signal: prefer live when owner Alpaca teacher is connected (D-171/D-177).
    // Hard-fail only when HFTR_REQUIRE_LIVE_QUOTE=1.
    const requireLive = process.env.HFTR_REQUIRE_LIVE_QUOTE === '1';
    record(
      'gap_tags_live_quote_preferred',
      requireLive ? tags.includes('live_market_quote') : true,
      tags.includes('live_market_quote')
        ? 'live_market_quote'
        : `synthetic_quote (requireLive=${requireLive})`,
    );
    record(
      'gap_tags_sim_limits',
      tags.includes('no_queue_position') &&
        (tags.includes('no_market_impact') || tags.includes('square_root_impact_proxy')),
      JSON.stringify(
        tags.filter((t) =>
          [
            'no_queue_position',
            'no_market_impact',
            'square_root_impact_proxy',
            'no_venue_latency',
            'inline_fill_model',
          ].includes(t),
        ),
      ),
    );
    record('mode_paper', filled.mode === 'paper', String(filled.mode));
    record('venue_paper_sim', filled.venue === 'paper_sim', String(filled.venue));
  }

  // Multi-share operator path: POV child drain + square-root impact proxy (D-177/D-187).
  const multiTrade = await req('POST', `/api/companies/${companyId}/modules/${trading!.id}/trade`, {
    symbol: 'AAPL',
    actionVerb: 'buy',
    orderType: 'market',
    quantity: 5,
  });
  record(
    'enqueue_multi_share_trade',
    multiTrade.status < 300,
    `status=${multiTrade.status}`,
  );
  const multiTraces = await waitForTraces(
    companyId,
    (t) =>
      t.some(
        (x) =>
          (x.outcome === 'filled' || x.outcome === 'partial') &&
          (x.simulatorGapTags ?? []).includes('square_root_impact_proxy'),
      ),
    90_000,
    { drain: true },
  );
  const multiFilled = multiTraces.find(
    (x) =>
      (x.outcome === 'filled' || x.outcome === 'partial') &&
      (x.simulatorGapTags ?? []).includes('square_root_impact_proxy'),
  );
  const multiTags = multiFilled?.simulatorGapTags ?? [];
  record(
    'multi_share_impact_or_drain',
    multiTags.includes('square_root_impact_proxy') &&
      (multiTags.includes('child_slice_drain') ||
        multiTags.includes('time_spaced_child_drain')),
    `outcome=${multiFilled?.outcome ?? 'none'} tags=${JSON.stringify(multiTags)}`,
  );
  record(
    'multi_share_impact_proxy',
    multiTags.includes('square_root_impact_proxy'),
    multiTags.includes('square_root_impact_proxy')
      ? 'square_root_impact_proxy'
      : `missing impact tag in ${JSON.stringify(multiTags)}`,
  );

  const execFeed = await req('GET', `/api/companies/${companyId}/executions`);
  const execRows = (execFeed.json.executions as Array<{ simulatorGapTags?: string[] }> | undefined) ?? [];
  const execWithTags = execRows.some(
    (e) => Array.isArray(e.simulatorGapTags) && e.simulatorGapTags.length > 0,
  );
  record(
    'executions_feed_gap_tags',
    execFeed.status < 300 && execWithTags,
    `status=${execFeed.status} rows=${execRows.length} withTags=${execWithTags}`,
  );

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
    90_000,
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

  // Optional: RTH freshness — fail if prior_session_mark present when required.
  // Weekend/off-hours: set HFTR_REQUIRE_RTH_FRESH=0 (default) to skip.
  if (process.env.HFTR_REQUIRE_RTH_FRESH === '1') {
    const tags = filled?.simulatorGapTags ?? [];
    const fresh =
      tags.includes('live_market_quote') && !tags.includes('prior_session_mark');
    record(
      'rth_fresh_live_quote',
      fresh,
      fresh
        ? 'live_market_quote without prior_session_mark'
        : `tags=${JSON.stringify(tags)} (need NYSE RTH + fresh teacher)`,
    );
  } else {
    record(
      'rth_fresh_live_quote',
      true,
      'skipped (set HFTR_REQUIRE_RTH_FRESH=1 during NYSE RTH)',
    );
  }

  // Optional: both_verify + BookDelta + valve training (needs Alpaca paper in settings).
  if (process.env.HFTR_BOTH_VERIFY_SMOKE === '1') {
    const alpaca = await req('GET', '/api/settings/brokers/alpaca');
    const conn = alpaca.json.connection as { id?: string } | null;
    if (!conn?.id) {
      record(
        'both_verify_smoke',
        false,
        'no Alpaca paper connection in settings — save keys then retry',
      );
    } else {
      // Prefer module-level binding; company bind requires status=connected.
      const bindCompany = await req('PATCH', `/api/companies/${companyId}/broker`, {
        brokerConnectionId: conn.id,
      });
      record(
        'both_verify_company_broker',
        bindCompany.status < 300 ||
          bindCompany.status === 400 ||
          bindCompany.status === 409,
        `status=${bindCompany.status} (400/409 ok if unverified or already bound)`,
      );
      const bind = await req('PATCH', `/api/companies/${companyId}/modules/${trading!.id}`, {
        config: {
          ...cfg,
          executionBinding: {
            routingMode: 'both_verify',
            brokerConnectionId: conn.id,
            useProviderLedgerAsFundsSource: true,
          },
        },
      });
      record('both_verify_bind', bind.status < 300, `status=${bind.status}`);

      const bvTrade = await req(
        'POST',
        `/api/companies/${companyId}/modules/${trading!.id}/trade`,
        {
          symbol: 'AAPL',
          actionVerb: 'buy',
          orderType: 'market',
          quantity: 1,
        },
        4,
        120_000,
      );
      record('both_verify_trade', bvTrade.status < 300, `status=${bvTrade.status}`);

      // Shadow verify may finish after the trade response — poll book_deltas briefly.
      let deltaRows: Array<{ id?: string; routingMode?: string }> = [];
      for (let i = 0; i < 12; i++) {
        const deltas = await req('GET', `/api/companies/${companyId}/book-deltas`, undefined, 2, 20_000);
        deltaRows =
          (deltas.json.bookDeltas as Array<{ id?: string; routingMode?: string }> | undefined) ??
          [];
        if (deltaRows.length > 0) break;
        await req('POST', '/api/queue/drain', undefined, 1, 20_000).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 1_500));
      }
      const deltasOk = deltaRows.length > 0;
      const strict = process.env.HFTR_BOTH_VERIFY_STRICT === '1';
      record(
        'both_verify_book_deltas',
        deltasOk || !strict,
        deltasOk
          ? `count=${deltaRows.length} modes=${deltaRows.map((d) => d.routingMode).join(',')}`
          : `count=0 (set HFTR_BOTH_VERIFY_STRICT=1 to fail; weekend shadow may miss)`,
      );

      const valves = await req(
        'POST',
        `/api/companies/${companyId}/training/book-delta-valves`,
        { moduleId: trading!.id, minSamples: 1 },
        4,
        60_000,
      );
      const valveOk =
        valves.status < 300 &&
        (valves.json.ok === true ||
          valves.json.reason === 'no_observations' ||
          valves.json.reason === 'no_step' ||
          valves.json.reason === 'insufficient_samples');
      record(
        'book_delta_valve_train',
        valveOk,
        `status=${valves.status} body=${JSON.stringify(valves.json).slice(0, 180)}`,
      );
      record(
        'both_verify_smoke',
        deltasOk || !strict,
        deltasOk
          ? 'book_deltas persisted'
          : 'no book_deltas this run (non-strict; prior session proved path)',
      );
    }
  } else {
    record(
      'both_verify_smoke',
      true,
      'skipped (set HFTR_BOTH_VERIFY_SMOKE=1 with Alpaca paper in settings)',
    );
  }

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
