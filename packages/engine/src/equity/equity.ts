/**
 * Pure deterministic company equity calculation.
 * equity = hard cash + sum(confirmed open position market values).
 * Model-free; caller supplies clock inputs for freshness.
 */

export interface EquityCashInput {
  cashCents: bigint;
}

export interface EquityConfirmedPosition {
  symbol: string;
  qty: bigint;
  venue?: string;
  connectionId?: string;
}

export type EquityMarkKind = 'broker_market_value' | 'venue_quote' | 'paper_quote';

export interface EquityMarkCandidate {
  sourceId: string;
  symbol: string;
  kind: EquityMarkKind;
  valueCents: bigint;
  capturedAtMs: number;
  venue?: string;
  connectionId?: string;
}

export interface CalculateCompanyEquityInput {
  cash: EquityCashInput;
  positions: readonly EquityConfirmedPosition[];
  marks: readonly EquityMarkCandidate[];
  nowMs: number;
  ttlMs: number;
}

export type CompanyEquityResult =
  | {
      status: 'fresh';
      equityCents: bigint;
      positionValueCents: bigint;
      usedSourceIds: string[];
    }
  | {
      status: 'unavailable';
      reason: string;
      missingSymbols: string[];
    };

function isFresh(mark: EquityMarkCandidate, nowMs: number, ttlMs: number): boolean {
  return nowMs - mark.capturedAtMs <= ttlMs;
}

function deterministicMedian(values: readonly bigint[]): bigint {
  if (values.length === 0) {
    throw new Error('median requires at least one value');
  }
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2n;
}

function dedupeMarksBySourceId(
  marks: readonly EquityMarkCandidate[],
): EquityMarkCandidate[] {
  const bySource = new Map<string, EquityMarkCandidate>();
  for (const candidate of marks) {
    const existing = bySource.get(candidate.sourceId);
    if (!existing || candidate.capturedAtMs > existing.capturedAtMs) {
      bySource.set(candidate.sourceId, candidate);
    }
  }
  return [...bySource.values()].sort((a, b) =>
    a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0,
  );
}

interface ResolvedPositionMark {
  valueCents: bigint;
  usedSourceIds: string[];
}

function resolvePositionMark(
  position: EquityConfirmedPosition,
  marks: readonly EquityMarkCandidate[],
  nowMs: number,
  ttlMs: number,
): ResolvedPositionMark | null {
  const freshForSymbol = marks.filter(
    (candidate) => candidate.symbol === position.symbol && isFresh(candidate, nowMs, ttlMs),
  );

  if (position.connectionId) {
    const brokerMark = freshForSymbol.find(
      (candidate) =>
        candidate.kind === 'broker_market_value' &&
        candidate.connectionId === position.connectionId,
    );
    if (brokerMark) {
      return { valueCents: brokerMark.valueCents, usedSourceIds: [brokerMark.sourceId] };
    }
  }

  if (position.venue) {
    const venueMark = freshForSymbol.find(
      (candidate) => candidate.kind === 'venue_quote' && candidate.venue === position.venue,
    );
    if (venueMark) {
      return {
        valueCents: position.qty * venueMark.valueCents,
        usedSourceIds: [venueMark.sourceId],
      };
    }
  }

  const paperMarks = dedupeMarksBySourceId(
    freshForSymbol.filter((candidate) => candidate.kind === 'paper_quote'),
  );
  if (paperMarks.length > 0) {
    const medianPrice = deterministicMedian(paperMarks.map((candidate) => candidate.valueCents));
    return {
      valueCents: position.qty * medianPrice,
      usedSourceIds: paperMarks.map((candidate) => candidate.sourceId),
    };
  }

  return null;
}

export function calculateCompanyEquity(input: CalculateCompanyEquityInput): CompanyEquityResult {
  const { cash, positions, marks, nowMs, ttlMs } = input;

  if (cash.cashCents < 0n) {
    return { status: 'unavailable', reason: 'negative_cash', missingSymbols: [] };
  }

  for (const candidate of marks) {
    if (candidate.valueCents < 0n) {
      return { status: 'unavailable', reason: 'negative_mark', missingSymbols: [] };
    }
  }

  const openPositions = positions.filter((row) => row.qty > 0n);
  const usedSourceIdSet = new Set<string>();
  let positionValueCents = 0n;
  const missingSymbols: string[] = [];

  for (const row of openPositions) {
    const resolved = resolvePositionMark(row, marks, nowMs, ttlMs);
    if (!resolved) {
      missingSymbols.push(row.symbol);
      continue;
    }
    positionValueCents += resolved.valueCents;
    for (const sourceId of resolved.usedSourceIds) {
      usedSourceIdSet.add(sourceId);
    }
  }

  if (missingSymbols.length > 0) {
    return {
      status: 'unavailable',
      reason: 'missing_fresh_marks',
      missingSymbols: [...missingSymbols].sort(),
    };
  }

  const usedSourceIds = [...usedSourceIdSet].sort();
  return {
    status: 'fresh',
    equityCents: cash.cashCents + positionValueCents,
    positionValueCents,
    usedSourceIds,
  };
}
