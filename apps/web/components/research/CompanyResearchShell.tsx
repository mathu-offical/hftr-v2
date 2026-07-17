'use client';

import type { ReactNode } from 'react';
import { ResearchViewProvider } from '@/components/research/ResearchViewContext';

/** Shared research view state for left panel + canvas overlay (D-040). */
export function CompanyResearchShell(props: { companyId: string; children: ReactNode }) {
  return <ResearchViewProvider companyId={props.companyId}>{props.children}</ResearchViewProvider>;
}
