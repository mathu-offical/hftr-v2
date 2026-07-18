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

    await expect(resolveCapitalAllocationUsdCents({} as never, 'nv_test')).resolves.toBe(
      75_000n,
    );
  });

  it('returns null for pct or missing refs', async () => {
    await expect(resolveCapitalAllocationUsdCents({} as never, null)).resolves.toBeNull();
    vi.spyOn(store, 'load').mockResolvedValue({
      kind: 'pct',
      scale: 0,
      valueInt: 25n,
    } as Awaited<ReturnType<typeof store.load>>);
    await expect(resolveCapitalAllocationUsdCents({} as never, 'nv_pct')).resolves.toBeNull();
  });
});
