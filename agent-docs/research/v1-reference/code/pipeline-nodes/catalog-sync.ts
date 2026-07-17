// Keeps pipeline TOOL_REGISTRY / LEVER_REGISTRY aligned with seeded-strategy-catalog.json (oq-038).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOL_REGISTRY } from "./registry";
import { LEVER_REGISTRY } from "./levers";

export type DeterministicToolCatalog = {
  pipelineTools: { id: string; nodeKind: string; produces: string | null }[];
  leverToolsByScope: Record<string, { id: string; bandRef?: string }[]>;
};

/** Catalog set_* tool id → LEVER_REGISTRY key (bias/router tools omitted by design). */
export const LEVER_CATALOG_TOOL_TO_KEY: Readonly<Record<string, string>> = {
  set_risk_per_trade_pct: "risk_per_trade_pct",
  set_portfolio_heat_pct: "portfolio_heat_pct",
  set_portfolio_vol_target: "portfolio_vol_target_pct",
  set_sector_concentration_pct: "sector_concentration_pct",
  set_max_concurrent_names: "max_concurrent_names",
  set_correlation_health_floor: "correlation_health_floor",
  set_atr_stop_multiplier: "atr_stop_multiplier",
  set_scale_out_fraction: "scale_out_fraction_pct",
  set_trail_multiplier: "trail_multiplier",
  set_time_stop: "time_stop_min",
  set_reentry_policy: "reentry_count",
  set_pyramiding_policy: "pyramid_levels",
  declare_branch_order_classes: "allowed_order_class",
  set_participation_rate: "participation_rate_pct",
  set_time_in_force: "tif",
  set_limit_offset_bps: "limit_offset_bps",
  set_max_slippage_bps: "max_slippage_bps",
  set_fill_timeout_ms: "fill_timeout_ms",
  set_cancel_replace_policy: "cancel_replace_attempts",
};

const CATALOG_PATH = join(
  process.cwd(),
  "../../agent-docs/research/seeded-strategy-catalog.json"
);

export function loadDeterministicToolCatalog(): DeterministicToolCatalog {
  const raw = readFileSync(CATALOG_PATH, "utf8");
  const json = JSON.parse(raw) as { deterministicToolCatalog: DeterministicToolCatalog };
  return json.deterministicToolCatalog;
}

export function validateCatalogRegistrySync(catalog: DeterministicToolCatalog): string[] {
  const errors: string[] = [];
  const registryToolIds = new Set(TOOL_REGISTRY.map((t) => t.id));
  const catalogPipelineIds = catalog.pipelineTools.map((t) => t.id);

  for (const id of catalogPipelineIds) {
    if (!registryToolIds.has(id)) errors.push(`catalog pipeline tool missing from TOOL_REGISTRY: ${id}`);
  }
  for (const id of registryToolIds) {
    if (!catalogPipelineIds.includes(id)) errors.push(`TOOL_REGISTRY tool missing from catalog pipelineTools: ${id}`);
  }

  for (const tool of catalog.pipelineTools) {
    const spec = TOOL_REGISTRY.find((t) => t.id === tool.id);
    if (!spec) continue;
    if (spec.nodeKind !== tool.nodeKind) {
      errors.push(`nodeKind mismatch for ${tool.id}: registry=${spec.nodeKind} catalog=${tool.nodeKind}`);
    }
    const produces = spec.produces ?? null;
    if (produces !== tool.produces) {
      errors.push(`produces mismatch for ${tool.id}: registry=${produces} catalog=${tool.produces}`);
    }
  }

  const leverKeys = new Set(LEVER_REGISTRY.map((d) => d.key));
  for (const [scope, tools] of Object.entries(catalog.leverToolsByScope)) {
    for (const tool of tools) {
      const mappedKey = LEVER_CATALOG_TOOL_TO_KEY[tool.id];
      if (!mappedKey) continue;
      if (!leverKeys.has(mappedKey)) {
        errors.push(`catalog lever tool ${tool.id} maps to missing LEVER_REGISTRY key ${mappedKey} (${scope})`);
        continue;
      }
      const def = LEVER_REGISTRY.find((d) => d.key === mappedKey);
      if (tool.bandRef && def?.bandRef && def.bandRef !== tool.bandRef) {
        errors.push(`bandRef mismatch for ${mappedKey}: registry=${def.bandRef} catalog=${tool.bandRef}`);
      }
    }
  }

  return errors;
}
