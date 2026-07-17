import { describe, expect, it } from 'vitest';
import { numericValues } from '@hftr/db/schema';
import { walkValueLineage } from './lineage';

const ROOT_SOURCE_CLASSES = new Set([
  'live_feed',
  'synthetic_sim',
  'broker_state',
  'ledger',
  'clock',
  'calendar',
  'band_seed',
  'operator_input',
]);

describe('walkValueLineage', () => {
  it('walks parent chain to a root source class', async () => {
    const capturedAt = new Date('2026-07-17T12:00:00.000Z');
    const rootRef = 'nv_root_band';
    const derivedRef = 'nv_derived_qty';

    const rows: Record<
      string,
      {
        ref: string;
        kind: string;
        unit: string;
        scale: number;
        valueInt: bigint;
        sourceClass: string;
        sourceId: string;
        capturedAt: Date;
        parentRefs: string[];
      }
    > = {
      [derivedRef]: {
        ref: derivedRef,
        kind: 'quantity',
        unit: 'shares',
        scale: 0,
        valueInt: 10n,
        sourceClass: 'derived',
        sourceId: 'compile:sizing:test',
        capturedAt,
        parentRefs: [rootRef],
      },
      [rootRef]: {
        ref: rootRef,
        kind: 'bps',
        unit: 'bps',
        scale: 0,
        valueInt: 100n,
        sourceClass: 'band_seed',
        sourceId: 'band:sizing_basis:typical',
        capturedAt,
        parentRefs: [],
      },
    };

    const queryOrder = [derivedRef, rootRef];
    let queryIndex = 0;
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => {
              if (table !== numericValues) return [];
              const ref = queryOrder[queryIndex++];
              const row = ref ? rows[ref] : undefined;
              return row ? [row] : [];
            },
          }),
        }),
      }),
    } as never;

    const result = await walkValueLineage(db, derivedRef);
    expect(result.chain).toHaveLength(2);
    expect(result.chain[0]?.sourceClass).toBe('derived');
    expect(result.chain[1]?.sourceClass).toBe('band_seed');
    expect(ROOT_SOURCE_CLASSES.has(result.chain.at(-1)!.sourceClass)).toBe(true);
    expect(result.truncated).toBe(false);
  });
});
