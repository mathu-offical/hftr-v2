'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/client';

/**
 * D-200: after first paint, heal family layout / utility links / time hubs off the
 * Suspense critical path. Fire-and-forget — create/insert paths already reflow;
 * this repairs drift in the DB without blocking chrome or wiping the live canvas.
 */
export function CanvasFamilyLayoutSync(props: { companyId: string }) {
  const ranForCompany = useRef<string | null>(null);

  useEffect(() => {
    if (ranForCompany.current === props.companyId) return;
    ranForCompany.current = props.companyId;

    void api<{ ok: true; mutated: boolean }>(
      `/api/companies/${props.companyId}/canvas/family-layout`,
      { method: 'POST', signal: AbortSignal.timeout(45_000) },
    ).catch(() => {
      // Non-blocking heal — next navigation / engine insert still repairs.
    });
  }, [props.companyId]);

  return null;
}
