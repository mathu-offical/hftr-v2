import type { GuardrailPackageEntry } from '../limits/catalog-loader';
import { CATALOG_VERSION, loadGuardrailPackages } from '../limits/catalog-loader';

export type { GuardrailPackageEntry };

/** Immutable guardrail package registry (catalog-backed). */
export function getGuardrailPackage(packageId: string): GuardrailPackageEntry | undefined {
  return loadGuardrailPackages().get(packageId);
}

export function listGuardrailPackageIds(): string[] {
  return [...loadGuardrailPackages().keys()];
}

export function guardrailPackageRef(packageId: string) {
  const pkg = getGuardrailPackage(packageId);
  if (!pkg) return null;
  return {
    packageId: pkg.id,
    catalogVersion: CATALOG_VERSION,
    name: pkg.name,
    class: pkg.class,
  };
}
