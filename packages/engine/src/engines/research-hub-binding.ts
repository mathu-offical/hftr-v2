import type { Db } from '@hftr/db';
import {
  type ResearchLibraryBinding,
  resolveResearchLibraryBindingForInsert,
} from '@hftr/contracts';
import { ensureEngineDataHub } from './data-hub';
import {
  bindResearchPackToHub,
  mergeTargetLibraryIds,
  type BindResearchPackResult,
} from './research-hub-bind';

export type BindResearchEngineResult = BindResearchPackResult;

/** @deprecated Use bindResearchPackToHub */
export const bindResearchEngineToHub = bindResearchPackToHub;

/** Connect research ENGINE emit path to an existing company library shelf. */
export async function bindResearchEngineToLibrary(
  db: Db,
  companyId: string,
  researchEngineId: string,
  libraryId: string,
  now = new Date(),
): Promise<BindResearchEngineResult> {
  return bindResearchPackToHub(db, companyId, researchEngineId, libraryId, null, now);
}

/**
 * Apply resolved research library binding after a research ENGINE insert.
 * No-ops for `create_internal` and when parent hub is not provisioned yet (defer to ensureEngineDataHub).
 */
export async function applyResearchLibraryBindingOnInsert(
  db: Db,
  companyId: string,
  researchEngineId: string,
  researchTemplateId: string,
  explicitBinding: ResearchLibraryBinding | undefined,
  existingEngines: ReadonlyArray<{ id: string; templateId: string }>,
  now = new Date(),
): Promise<BindResearchEngineResult> {
  const binding = resolveResearchLibraryBindingForInsert({
    ...(explicitBinding !== undefined ? { explicit: explicitBinding } : {}),
    researchTemplateId,
    existingEngines,
  });

  switch (binding.mode) {
    case 'create_internal':
      return { updatedModuleIds: [] };
    case 'connect_library':
      return bindResearchPackToHub(
        db,
        companyId,
        researchEngineId,
        binding.libraryId,
        null,
        now,
      );
    case 'attach_execution': {
      const resolved = resolveResearchLibraryBindingForInsert({
        researchTemplateId,
        existingEngines,
      });
      const parentId =
        binding.engineInstanceId ??
        (resolved.mode === 'attach_execution' ? resolved.engineInstanceId : undefined);
      if (!parentId) return { updatedModuleIds: [] };
      const hub = await ensureEngineDataHub(db, companyId, parentId, now);
      if (!hub.hubLibraryId) return { updatedModuleIds: [] };
      return bindResearchPackToHub(
        db,
        companyId,
        researchEngineId,
        hub.hubLibraryId,
        hub.hubModuleId,
        now,
      );
    }
    default: {
      const _exhaustive: never = binding;
      return _exhaustive;
    }
  }
}

export { bindResearchPackToHub, mergeTargetLibraryIds };
