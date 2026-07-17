import type { ConceptBatch } from '@hftr/contracts';

/**
 * Injected from the app layer so @hftr/engine never imports @hftr/llm.
 * When absent or failing, research handlers fall back to deterministic placeholders.
 */
export interface ResearchSynthesizeInput {
  companyId: string;
  moduleId: string;
  jobId: string;
  topicScope: string;
  topicSectors: string[];
  philosophyAxes: string[];
  catalogHints: Array<{
    catalog: string;
    entryKey: string;
    title: string;
    tier: string | null;
  }>;
  existingConceptTitles: string[];
}

export interface ModelGateway {
  synthesizeResearch(
    input: ResearchSynthesizeInput,
  ): Promise<{ ok: true; batch: ConceptBatch } | { ok: false; failure: string }>;
}
