import {
  MODULE_SERVICE_REQUIREMENTS,
  type ModuleServiceCoverage,
  type ModuleType,
  type ServiceCapability,
} from '@hftr/contracts';

export type ServiceSourceKind = 'broker_connection' | 'user_api_key';

export type ModuleServiceSource = {
  id: string;
  kind: ServiceSourceKind;
  available: boolean;
  capabilities: ServiceCapability[];
};

export type ModuleServiceInput = {
  moduleId: string;
  moduleType: ModuleType;
};

export type ModuleServiceBinding = {
  moduleId: string;
  sourceId: string;
  sourceKind: ServiceSourceKind;
  capability: ServiceCapability;
};

export type ResolvedModuleServiceCoverage = ModuleServiceCoverage & {
  bindings: ModuleServiceBinding[];
};

function dedupeSorted(caps: Iterable<ServiceCapability>): ServiceCapability[] {
  return [...new Set(caps)].sort();
}

function sourceKey(source: ModuleServiceSource): string {
  return `${source.kind}:${source.id}`;
}

function compareBindings(a: ModuleServiceBinding, b: ModuleServiceBinding): number {
  return (
    a.sourceKind.localeCompare(b.sourceKind) ||
    a.sourceId.localeCompare(b.sourceId) ||
    a.capability.localeCompare(b.capability) ||
    a.moduleId.localeCompare(b.moduleId)
  );
}

function normalizeSources(sources: ModuleServiceSource[]): ModuleServiceSource[] {
  const byKey = new Map<string, ModuleServiceSource>();

  for (const source of sources) {
    const key = sourceKey(source);
    const existing = byKey.get(key);
    const normalizedCapabilities = dedupeSorted(source.capabilities);

    if (!existing) {
      byKey.set(key, {
        ...source,
        capabilities: normalizedCapabilities,
      });
      continue;
    }

    byKey.set(key, {
      id: existing.id,
      kind: existing.kind,
      available: existing.available && source.available,
      capabilities: dedupeSorted([...existing.capabilities, ...normalizedCapabilities]),
    });
  }

  return [...byKey.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
  );
}

function resolveModule(
  module: ModuleServiceInput,
  sources: ModuleServiceSource[],
): ResolvedModuleServiceCoverage {
  const requirements = MODULE_SERVICE_REQUIREMENTS[module.moduleType];
  const relevantCapabilities = new Set<ServiceCapability>([
    ...requirements.required,
    ...requirements.optional,
  ]);

  const bindings: ModuleServiceBinding[] = [];

  for (const source of sources) {
    if (!source.available) continue;

    for (const capability of source.capabilities) {
      if (!relevantCapabilities.has(capability)) continue;

      bindings.push({
        moduleId: module.moduleId,
        sourceId: source.id,
        sourceKind: source.kind,
        capability,
      });
    }
  }

  bindings.sort(compareBindings);

  const boundCapabilities = dedupeSorted(bindings.map((binding) => binding.capability));
  const boundSet = new Set(boundCapabilities);

  return {
    moduleId: module.moduleId,
    moduleType: module.moduleType,
    required: [...requirements.required],
    optional: [...requirements.optional],
    boundCapabilities,
    missingRequired: requirements.required.filter((cap) => !boundSet.has(cap)),
    missingOptional: requirements.optional.filter((cap) => !boundSet.has(cap)),
    bindings,
  };
}

export function resolveModuleServiceCoverage(
  modules: ModuleServiceInput[],
  sources: ModuleServiceSource[],
): ResolvedModuleServiceCoverage[] {
  const normalizedSources = normalizeSources(sources);

  return [...modules]
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId))
    .map((module) => resolveModule(module, normalizedSources));
}
