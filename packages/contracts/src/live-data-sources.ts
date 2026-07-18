import { z } from 'zod';
import { ResearchSourceKind } from './research-bus';
import {
  ResearchSourceAuthMode,
  ResearchSourceImplementation,
  ResearchSourceLiveMode,
  type ResearchSourceDescriptor,
} from './research-source-registry';

export const LiveDataSourceStatus = z.enum([
  'ready',
  'missing_key',
  'stub',
  'researched',
  'public',
]);
export type LiveDataSourceStatus = z.infer<typeof LiveDataSourceStatus>;

export const LiveDataSourceRow = z.object({
  kind: ResearchSourceKind,
  domain: z.string(),
  label: z.string(),
  authMode: ResearchSourceAuthMode,
  feedClass: z.string(),
  implementation: ResearchSourceImplementation,
  liveMode: ResearchSourceLiveMode,
  status: LiveDataSourceStatus,
  docsUrl: z.string().url(),
  notes: z.string(),
  /** Canvas live_api module ids already bound to this hydrator */
  canvasModuleIds: z.array(z.string().uuid()).default([]),
});
export type LiveDataSourceRow = z.infer<typeof LiveDataSourceRow>;

export const LiveDataSourcesResponse = z.object({
  sources: z.array(LiveDataSourceRow).max(64),
  fetchedAt: z.string().datetime(),
});
export type LiveDataSourcesResponse = z.infer<typeof LiveDataSourcesResponse>;

export function liveDataSourceLabel(kind: z.infer<typeof ResearchSourceKind>): string {
  return kind.replace(/_/g, ' ');
}

/**
 * Map registry descriptor + credential readiness to operator-facing status.
 * researched/stub override auth; public = no-auth sources that are ready.
 */
export function resolveLiveDataSourceStatus(
  descriptor: Pick<ResearchSourceDescriptor, 'implementation' | 'authMode'>,
  ready: boolean,
): LiveDataSourceStatus {
  switch (descriptor.implementation) {
    case 'researched':
      return 'researched';
    case 'stub':
      return 'stub';
    case 'shipped': {
      if (descriptor.authMode === 'none' && ready) return 'public';
      if (ready) return 'ready';
      return 'missing_key';
    }
    default: {
      const _exhaustive: never = descriptor.implementation;
      return _exhaustive;
    }
  }
}
