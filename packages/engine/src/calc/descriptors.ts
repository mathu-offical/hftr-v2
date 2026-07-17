import { BandPosition, FreshnessClass, ValueDescriptor } from '@hftr/contracts';
import type { Clock } from '../clock';
import * as fx from './fixed';
import type { StoredRow } from './store';

/**
 * Qualitative descriptors — the only view of a value a model ever receives
 * (number-handling.md §6).
 */

export interface BandDefinition {
  minInt: bigint;
  typicalLowInt: bigint;
  typicalHighInt: bigint;
  maxInt: bigint;
  scale: number;
}

export function bandPosition(row: StoredRow, band: BandDefinition): BandPosition {
  const v = fx.rescale({ valueInt: row.valueInt, scale: row.scale }, band.scale).valueInt;
  if (v < band.minInt) return 'below_min';
  if (v > band.maxInt) return 'above_max';
  if (v < band.typicalLowInt) return 'low';
  if (v > band.typicalHighInt) return 'high';
  return 'typical';
}

export function freshness(row: StoredRow, clock: Clock): FreshnessClass {
  const age = clock.nowMs() - row.capturedAt.getTime();
  const ttl = Number(row.ttlMs);
  if (age > ttl) return 'stale';
  if (age > ttl / 2) return 'aging';
  return 'fresh';
}

export function describe(row: StoredRow, clock: Clock, band?: BandDefinition): ValueDescriptor {
  return {
    ref: row.ref,
    kind: row.kind,
    band: band ? bandPosition(row, band) : null,
    deltaClass: null, // requires a comparison value; supplied by pipeline callers
    freshness: freshness(row, clock),
    vsThreshold: null,
  };
}
