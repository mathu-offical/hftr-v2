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

/** Researched stub kinds registered but not yet wired to live adapters. */
const STUB_KINDS = new Set<ResearchSourceKind>([]);

export function throwResearchStub(sourceKind: ResearchSourceKind): never {
  const code = STUB_KINDS.has(sourceKind) ? 'not_implemented' : 'unsupported_source';
  throw new ResearchStubError(sourceKind, code);
}
