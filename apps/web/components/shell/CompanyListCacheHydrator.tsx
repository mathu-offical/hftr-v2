'use client';

import { useEffect } from 'react';
import {
  setCompanyListMeta,
  toCompanyListMeta,
  type CompanyListMeta,
} from '@/lib/company-list-cache';

/**
 * Hydrate the company list metadata cache from server-rendered directory rows (D-197).
 */
export function CompanyListCacheHydrator(props: {
  companies: Array<{ id: string; name: string; mode: string }>;
}) {
  useEffect(() => {
    const rows: CompanyListMeta[] = toCompanyListMeta(props.companies);
    setCompanyListMeta(rows);
  }, [props.companies]);

  return null;
}
