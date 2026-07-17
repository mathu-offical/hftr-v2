// Re-exports regime router (RegimeSnapshot + nomination bias). See regime-snapshot.ts.

export {
  type RegimeClassification,
  type RegimeSnapshot,
  type LegacyRegimeClassification,
  buildRegimeSnapshot,
  classifyRegimeWithSnapshot,
  classifyFromDrivers,
  preferredFamiliesForClassification,
  regimeSnapshotEvidenceRef,
} from "./regime-snapshot";

import { classifyRegimeWithSnapshot, type LegacyRegimeClassification } from "./regime-snapshot";

export type Regime = LegacyRegimeClassification["regime"];

/** @deprecated Use classifyRegimeWithSnapshot for full RegimeSnapshot lineage. */
export function classifyRegime(seed: string): Omit<LegacyRegimeClassification, "snapshot"> & { regime: Regime } {
  const r = classifyRegimeWithSnapshot(seed, "workspace-unknown", ["technology"]);
  const { snapshot: _s, ...rest } = r;
  return rest;
}
