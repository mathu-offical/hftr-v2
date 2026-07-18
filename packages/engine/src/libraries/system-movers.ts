import type { Db } from '@hftr/db';
import { SystemTopicScope } from '@hftr/contracts';
import { ensureSystemLibrary } from './ensure-system-library';
import {
  MOVERS_LENS_PLACEHOLDER_SEEDS,
  SYSTEM_LIBRARY_REGISTRY,
} from './system-library-registry';

export const MOVERS_LIBRARY_NAME = 'Daily movers watch';
export const MOVERS_TOPIC_SCOPE = SystemTopicScope.MOVERS;

/** Back-compat: three movers lens placeholders (excludes daily report). */
export const MOVERS_PLACEHOLDER_SEEDS = MOVERS_LENS_PLACEHOLDER_SEEDS;

export type EnsureSystemMoversLibraryOpts = {
  refreshPlaceholders?: boolean;
};

/**
 * Idempotent company-scoped system:movers library. Delegates to the shared registry
 * (three lenses + daily movers report placeholder).
 */
export async function ensureSystemMoversLibrary(
  db: Db,
  companyId: string,
  now: Date,
  opts?: EnsureSystemMoversLibraryOpts,
): Promise<string> {
  return ensureSystemLibrary(db, companyId, MOVERS_TOPIC_SCOPE, now, opts);
}

export { SYSTEM_LIBRARY_REGISTRY };
