'use client';

import {
  MARKET_HUB_POLL_MS,
  loadMarketHub,
  type MarketHubCacheKey,
} from '@/lib/market-hub-cache';
import { api } from '@/lib/client';
import type { MarketHubResponse } from '@hftr/contracts';
import { useEffect } from 'react';

/**
 * Keep market-hub warm while the company shell is mounted so opening
 * Market posture never cold-loads. Silent — no UI.
 */
export function MarketHubWarmPrefetch(props: { companyId: string }) {
  useEffect(() => {
    const key: MarketHubCacheKey = { companyId: props.companyId };
    const fetcher = () => api<MarketHubResponse>(`/api/companies/${props.companyId}/market-hub`);

    const tick = () => {
      void loadMarketHub(key, fetcher, { force: false, allowStale: true }).catch(() => {
        // warm path is best-effort
      });
    };

    // Immediate warm + cadence poll; loadMarketHub short-circuits when fresh.
    tick();
    const interval = setInterval(tick, MARKET_HUB_POLL_MS);
    return () => clearInterval(interval);
  }, [props.companyId]);

  return null;
}
