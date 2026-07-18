'use client';

import type { ReactNode } from 'react';
import { ResearchViewProvider } from '@/components/research/ResearchViewContext';
import { DataViewProvider } from '@/components/panels/DataViewContext';
import { MarketPostureViewProvider } from '@/components/panels/MarketPostureViewContext';
import { MarketHubWarmPrefetch } from '@/components/panels/MarketHubWarmPrefetch';
import { LiveDataSourcesWarmPrefetch } from '@/components/panels/LiveDataSourcesWarmPrefetch';

/** Shared research + market posture + data explorer view state for left panel + canvas overlays. */
export function CompanyResearchShell(props: { companyId: string; children: ReactNode }) {
  return (
    <ResearchViewProvider companyId={props.companyId}>
      <MarketPostureViewProvider companyId={props.companyId}>
        <DataViewProvider companyId={props.companyId}>
          <MarketHubWarmPrefetch companyId={props.companyId} />
          <LiveDataSourcesWarmPrefetch companyId={props.companyId} />
          {props.children}
        </DataViewProvider>
      </MarketPostureViewProvider>
    </ResearchViewProvider>
  );
}
