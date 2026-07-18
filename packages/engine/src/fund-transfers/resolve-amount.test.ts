import { describe, expect, it, vi } from 'vitest';
import { resolveCapitalAllocationUsdCents } from './resolve-amount';
import * as store from '../calc/store';

describe('resolveCapitalAllocationUsdCents', () => {
  it('returns scale-0 usd_cents valueInt', async () => {
    vi.spyOn(store, 'load').mockResolvedValue({
      kind: 'usd_cents',
      scale: 0,
      valueInt: 75_000n,
    } as Awaited<ReturnType<typeof store.load>>);

    await expect(resolveCapitalAllocationUsdCents({} as never, 'nv_test')).resolves.toBe(75_000n);
  });

  it('returns null for missing refs', async () => {
    await expect(resolveCapitalAllocationUsdCents({} as never, null)).resolves.toBeNull();
  });

  it('returns null for pct without base balance', async () => {
    vi.spyOn(store, 'load').mockResolvedValue({
      kind: 'pct',
      scale: 4,
      valueInt: 250_000n,
    } as Awaited<ReturnType<typeof store.load>>);
    await expect(resolveCapitalAllocationUsdCents({} as never, 'nv_pct')).resolves.toBeNull();
  });

  it('resolves scale-4 pct against base balance (floor)', async () => {
    vi.spyOn(store, 'load').mockResolvedValue({
      kind: 'pct',
      scale: 4,
      valueInt: 250_000n, // 25.0000%
    } as Awaited<ReturnType<typeof store.load>>);
    await expect(
      resolveCapitalAllocationUsdCents({} as never, 'nv_pct', {
        baseBalanceCents: 1_000_000n,
      }),
    ).resolves.toBe(250_000n);
  });

  it('returns null for pct over 100% or non-positive result', async () => {
    vi.spyOn(store, 'load').mockResolvedValue({
      kind: 'pct',
      scale: 4,
      valueInt: 1_000_001n,
    } as Awaited<ReturnType<typeof store.load>>);
    await expect(
      resolveCapitalAllocationUsdCents({} as never, 'nv_pct', {
        baseBalanceCents: 1_000_000n,
      }),
    ).resolves.toBeNull();

    vi.spyOn(store, 'load').mockResolvedValue({
      kind: 'pct',
      scale: 4,
      valueInt: 1n, // tiny pct of small base floors to 0
    } as Awaited<ReturnType<typeof store.load>>);
    await expect(
      resolveCapitalAllocationUsdCents({} as never, 'nv_pct', {
        baseBalanceCents: 10n,
      }),
    ).resolves.toBeNull();
  });
});
