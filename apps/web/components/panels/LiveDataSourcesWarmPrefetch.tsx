'use client';

import { useEffect } from 'react';
import type { LiveDataSourcesResponse } from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  loadLiveDataSources,
  type LiveDataSourcesCacheKey,
} from '@/lib/live-data-sources-cache';

/**
 * Warm live-data-sources inventory (metadata only) while the company shell is mounted.
 */
export function LiveDataSourcesWarmPrefetch(props: { companyId: string }) {
  useEffect(() => {
    const key: LiveDataSourcesCacheKey = { companyId: props.companyId };
    const fetcher = () =>
      api<LiveDataSourcesResponse>(`/api/companies/${props.companyId}/live-data-sources`);

    void loadLiveDataSources(key, fetcher, { force: false, allowStale: true }).catch(() => {
      // warm path is best-effort
    });
  }, [props.companyId]);

  return null;
}
