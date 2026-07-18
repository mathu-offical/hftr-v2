import type { ResearchSourceKind } from '@hftr/contracts';

export class ResearchStubError extends Error {
  constructor(
    public readonly sourceKind: ResearchSourceKind,
    public readonly code: 'not_implemented' | 'unsupported_source',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ResearchStubError';
  }
}

/** Researched stub kinds that are registered but not yet wired to live adapters. */
export function throwResearchStub(sourceKind: ResearchSourceKind): never {
  const code =
    sourceKind === 'twelve_data' || sourceKind === 'marketstack'
      ? 'unsupported_source'
      : 'not_implemented'; // gdelt_news until rate-limit backoff ships
  throw new ResearchStubError(sourceKind, code);
}
