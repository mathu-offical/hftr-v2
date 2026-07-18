'use client';

import type { ReactNode } from 'react';
import { ResearchViewProvider } from '@/components/research/ResearchViewContext';
import { MarketPostureViewProvider } from '@/components/panels/MarketPostureViewContext';
import { MarketHubWarmPrefetch } from '@/components/panels/MarketHubWarmPrefetch';

/** Shared research + market posture view state for left panel + canvas overlays. */
export function CompanyResearchShell(props: { companyId: string; children: ReactNode }) {
  return (
    <ResearchViewProvider companyId={props.companyId}>
      <MarketPostureViewProvider companyId={props.companyId}>
        <MarketHubWarmPrefetch companyId={props.companyId} />
        {props.children}
      </MarketPostureViewProvider>
    </ResearchViewProvider>
  );
}
