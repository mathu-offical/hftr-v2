import type { Db } from '@hftr/db';
import { calcOperations } from '@hftr/db/schema';
import { CalcRequest, CalcResult, CalcExprNodeT, NumericKind } from '@hftr/contracts';
import type { Clock } from '../clock';
import * as fx from './fixed';
import { checkInput } from './sanity';
import { load, loadMany, record, type StoredRow } from './store';
import { divUnit, mulUnit, requireSameUnit, UnitError } from './units';

/**
 * Calculator entry point (number-handling.md §4). Evaluates a bounded
 * expression (or registered static op) over ValueRefs, records the output as
 * a new derived value, and appends an audit row to calc_operations. Fails
 * closed on stale inputs, unit mismatches, and sanity violations.
 */

export interface CalcCaller {
  jobId?: string | null;
  tier?: string | null;
  moduleId?: string | null;
  companyId?: string | null;
}

const FORMULA_VERSION = 'calc_v1';
const EXPR_MAX_NODES = 50;
const DERIVED_TTL_MS = 5 * 60 * 1000;

interface EvalValue {
  fixed: fx.Fixed;
  unit: string;
}

function collectRefs(node: CalcExprNodeT, refs: Set<string>, budget: { nodes: number }): void {
  budget.nodes += 1;
  if (budget.nodes > EXPR_MAX_NODES) throw new UnitError('expression too large');
  if (node.op === 'ref') {
    refs.add(node.ref);
    return;
  }
  for (const child of node.args) collectRefs(child, refs, budget);
}

function evalNode(node: CalcExprNodeT, values: Map<string, StoredRow>): EvalValue {
  switch (node.op) {
    case 'ref': {
      const row = values.get(node.ref);
      if (!row) throw new Error(`missing ref ${node.ref}`);
      return { fixed: { valueInt: row.valueInt, scale: row.scale }, unit: row.unit };
    }
    case 'add':
    case 'sub':
    case 'min':
    case 'max': {
      const sameUnitOps = { add: fx.add, sub: fx.sub, min: fx.min, max: fx.max } as const;
      const apply = sameUnitOps[node.op];
      const parts = node.args.map((a) => evalNode(a, values));
      const unit = requireSameUnit(
        node.op,
        parts.map((p) => p.unit),
      );
      const reduced = parts.slice(1).reduce((acc, p) => apply(acc, p.fixed), parts[0]!.fixed);
      return { fixed: reduced, unit };
    }
    case 'mul': {
      const parts = node.args.map((a) => evalNode(a, values));
      return parts
        .slice(1)
        .reduce(
          (acc, p) => ({ fixed: fx.mul(acc.fixed, p.fixed), unit: mulUnit(acc.unit, p.unit) }),
          parts[0]!,
        );
    }
    case 'div': {
      const parts = node.args.map((a) => evalNode(a, values));
      return parts.slice(1).reduce(
        (acc, p) => ({
          fixed: fx.div(acc.fixed, p.fixed, Math.max(acc.fixed.scale, p.fixed.scale, 4)),
          unit: divUnit(acc.unit, p.unit),
        }),
        parts[0]!,
      );
    }
    case 'abs': {
      const v = evalNode(node.args[0]!, values);
      return { fixed: fx.abs(v.fixed), unit: v.unit };
    }
    case 'neg': {
      const v = evalNode(node.args[0]!, values);
      return { fixed: fx.neg(v.fixed), unit: v.unit };
    }
    case 'clamp': {
      const [v, lo, hi] = node.args.map((a) => evalNode(a, values));
      requireSameUnit('clamp', [v!.unit, lo!.unit, hi!.unit]);
      return { fixed: fx.clamp(v!.fixed, lo!.fixed, hi!.fixed), unit: v!.unit };
    }
    default: {
      const _exhaustive: never = node;
      throw new Error(String(_exhaustive));
    }
  }
}

export async function evaluate(
  db: Db,
  clock: Clock,
  request: CalcRequest,
  caller: CalcCaller,
): Promise<CalcResult> {
  const startedAt = clock.nowMs();
  const parsed = CalcRequest.parse(request);

  if (parsed.kind === 'static') {
    // Static op catalog lands with the pipeline milestone (M2); expr covers M0-M1 needs.
    return audit(db, clock, caller, startedAt, {
      opKind: 'static',
      opName: parsed.opName,
      inputRefs: Object.values(parsed.args),
      status: 'unit_error',
      outputRef: null,
      failureDetail: `static op catalog not yet seeded: ${parsed.opName}`,
    });
  }

  const refs = new Set<string>();
  try {
    collectRefs(parsed.expr, refs, { nodes: 0 });
  } catch (err) {
    return audit(db, clock, caller, startedAt, {
      opKind: 'expr',
      opName: 'expr',
      inputRefs: [...refs],
      status: 'unit_error',
      outputRef: null,
      failureDetail: err instanceof Error ? err.message : String(err),
    });
  }

  const values = await loadMany(db, [...refs]);
  for (const row of values.values()) {
    const check = checkInput(row, clock);
    if (!check.ok) {
      return audit(db, clock, caller, startedAt, {
        opKind: 'expr',
        opName: 'expr',
        inputRefs: [...refs],
        status: check.code,
        outputRef: null,
        failureDetail: check.detail,
      });
    }
  }

  let result: EvalValue;
  try {
    result = evalNode(parsed.expr, values);
  } catch (err) {
    return audit(db, clock, caller, startedAt, {
      opKind: 'expr',
      opName: 'expr',
      inputRefs: [...refs],
      status: err instanceof UnitError ? 'unit_error' : 'sanity_block',
      outputRef: null,
      failureDetail: err instanceof Error ? err.message : String(err),
    });
  }

  const outputRef = await record(db, clock, {
    kind: parsed.outputKind as NumericKind,
    unit: parsed.outputUnit,
    scale: result.fixed.scale,
    valueInt: result.fixed.valueInt,
    sourceClass: 'derived',
    sourceId: `calc:${FORMULA_VERSION}`,
    ttlMs: DERIVED_TTL_MS,
    parentRefs: [...refs],
    companyId: caller.companyId ?? null,
    moduleId: caller.moduleId ?? null,
  });

  return audit(db, clock, caller, startedAt, {
    opKind: 'expr',
    opName: 'expr',
    inputRefs: [...refs],
    status: 'ok',
    outputRef,
    failureDetail: null,
  });
}

async function audit(
  db: Db,
  clock: Clock,
  caller: CalcCaller,
  startedAtMs: number,
  row: {
    opKind: 'static' | 'expr';
    opName: string;
    inputRefs: string[];
    status: 'ok' | 'stale_input' | 'sanity_block' | 'unit_error';
    outputRef: string | null;
    failureDetail: string | null;
  },
): Promise<CalcResult> {
  await db.insert(calcOperations).values({
    opKind: row.opKind,
    opName: row.opName,
    formulaVersion: FORMULA_VERSION,
    inputRefs: row.inputRefs,
    outputRef: row.outputRef,
    status: row.status,
    jobId: caller.jobId ?? null,
    tier: caller.tier ?? null,
    moduleId: caller.moduleId ?? null,
    durationUs: Math.max(0, Math.round((clock.nowMs() - startedAtMs) * 1000)),
    sanityResults: row.failureDetail ? { detail: row.failureDetail } : {},
  });

  if (row.status !== 'ok' || !row.outputRef) {
    return {
      status: row.status,
      outputRef: null,
      descriptor: null,
      failureDetail: row.failureDetail,
    };
  }
  const stored = await load(db, row.outputRef);
  return {
    status: 'ok',
    outputRef: row.outputRef,
    descriptor: {
      ref: stored.ref,
      kind: stored.kind,
      band: null,
      deltaClass: null,
      freshness: 'fresh',
      vsThreshold: null,
    },
    failureDetail: null,
  };
}
