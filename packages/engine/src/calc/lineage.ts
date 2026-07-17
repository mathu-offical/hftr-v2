import { eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { numericValues } from '@hftr/db/schema';

export const MAX_LINEAGE_DEPTH = 32;

export interface LineageNode {
  ref: string;
  kind: string;
  unit: string;
  scale: number;
  valueInt: string;
  sourceClass: string;
  sourceId: string;
  capturedAt: string;
  parentRefs: string[];
  depth: number;
}

export interface LineageWalkResult {
  rootRef: string;
  chain: LineageNode[];
  truncated: boolean;
}

/**
 * Walk parentRefs recursively from a ValueRef root (newest-first chain).
 * Stops at MAX_LINEAGE_DEPTH or when a parent is missing.
 */
export async function walkValueLineage(
  db: Db,
  rootRef: string,
  maxDepth: number = MAX_LINEAGE_DEPTH,
): Promise<LineageWalkResult> {
  const chain: LineageNode[] = [];
  const visited = new Set<string>();
  let currentRef: string | null = rootRef;
  let truncated = false;

  while (currentRef && chain.length < maxDepth) {
    if (visited.has(currentRef)) {
      truncated = true;
      break;
    }
    visited.add(currentRef);

    const rows: Array<{
      ref: string;
      kind: string;
      unit: string;
      scale: number;
      valueInt: bigint;
      sourceClass: string;
      sourceId: string;
      capturedAt: Date;
      parentRefs: string[] | null;
    }> = await db
      .select({
        ref: numericValues.ref,
        kind: numericValues.kind,
        unit: numericValues.unit,
        scale: numericValues.scale,
        valueInt: numericValues.valueInt,
        sourceClass: numericValues.sourceClass,
        sourceId: numericValues.sourceId,
        capturedAt: numericValues.capturedAt,
        parentRefs: numericValues.parentRefs,
      })
      .from(numericValues)
      .where(eq(numericValues.ref, currentRef))
      .limit(1);
    const row = rows[0];
    if (!row) break;

    chain.push({
      ref: row.ref,
      kind: row.kind,
      unit: row.unit,
      scale: row.scale,
      valueInt: row.valueInt.toString(),
      sourceClass: row.sourceClass,
      sourceId: row.sourceId,
      capturedAt: row.capturedAt.toISOString(),
      parentRefs: row.parentRefs ?? [],
      depth: chain.length,
    });

    const parents: string[] = row.parentRefs ?? [];
    currentRef = parents.length > 0 ? parents[0]! : null;
  }

  if (currentRef && chain.length >= maxDepth) {
    truncated = true;
  }

  return { rootRef, chain, truncated };
}
