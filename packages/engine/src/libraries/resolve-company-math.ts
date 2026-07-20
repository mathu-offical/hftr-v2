import { parseMathTypeFromConfig } from '@hftr/contracts';

export type CompanyMathModule = {
  id: string;
  type: string;
  engineInstanceId?: string | null;
  toolOwnerModuleId?: string | null;
  config?: unknown;
};

/**
 * Resolve a Math module for concept ownership / lineage (D-245).
 * Prefer engine-scoped hub for `engineInstanceId`, then any engine hub, then dedicated Math.
 */
export function resolveCompanyMathModuleId(
  companyModules: readonly CompanyMathModule[],
  engineInstanceId?: string | null,
): string | null {
  const mathModules = companyModules.filter((m) => m.type === 'math');
  if (mathModules.length === 0) return null;

  if (engineInstanceId) {
    const scopedHub = mathModules.find(
      (m) =>
        m.engineInstanceId === engineInstanceId &&
        !m.toolOwnerModuleId &&
        (parseMathTypeFromConfig(m.config) === 'engine_math_hub' ||
          parseMathTypeFromConfig(m.config) === 'company_hub'),
    );
    if (scopedHub) return scopedHub.id;

    const scopedAny = mathModules.find(
      (m) => m.engineInstanceId === engineInstanceId && !m.toolOwnerModuleId,
    );
    if (scopedAny) return scopedAny.id;
  }

  const engineHub = mathModules.find(
    (m) =>
      !m.toolOwnerModuleId && parseMathTypeFromConfig(m.config) === 'engine_math_hub',
  );
  if (engineHub) return engineHub.id;

  const dedicated = mathModules.find((m) => Boolean(m.toolOwnerModuleId));
  return dedicated?.id ?? null;
}
