'use client';

import type { ReactNode } from 'react';
import { ResearchViewProvider } from '@/components/research/ResearchViewContext';
import { DataViewProvider } from '@/components/panels/DataViewContext';
import { MarketPostureViewProvider } from '@/components/panels/MarketPostureViewContext';
import { MarketHubWarmPrefetch } from '@/components/panels/MarketHubWarmPrefetch';
import { LiveDataSourcesWarmPrefetch } from '@/components/panels/LiveDataSourcesWarmPrefetch';
import { PanelShellProvider } from '@/components/panels/PanelShellContext';

/** Shared research + market posture + data explorer view state for left panel + canvas overlays. */
export function CompanyResearchShell(props: {
  companyId: string;
  companyMode?: string;
  children: ReactNode;
}) {
  return (
    <PanelShellProvider>
      <ResearchViewProvider companyId={props.companyId}>
        <MarketPostureViewProvider
          companyId={props.companyId}
          {...(props.companyMode !== undefined ? { companyMode: props.companyMode } : {})}
        >
          <DataViewProvider companyId={props.companyId}>
            <MarketHubWarmPrefetch companyId={props.companyId} />
            <LiveDataSourcesWarmPrefetch companyId={props.companyId} />
            {props.children}
          </DataViewProvider>
        </MarketPostureViewProvider>
      </ResearchViewProvider>
    </PanelShellProvider>
  );
}
