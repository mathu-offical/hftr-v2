import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import type { ClaimedJob } from '../queue/queue';

/**
 * Job handler registry. A handler's `kind` matches `jobs.kind`
 * ("<domain>.<action>", e.g. "maintenance.sweep", "trend.scan").
 * Handlers MUST be idempotent (at-least-once delivery).
 */

export interface HandlerContext {
  db: Db;
  clock: Clock;
  job: ClaimedJob;
}

export type JobHandler = (ctx: HandlerContext) => Promise<void>;

const registry = new Map<string, JobHandler>();

export function registerHandler(kind: string, handler: JobHandler): void {
  if (registry.has(kind)) {
    throw new Error(`duplicate handler registration: ${kind}`);
  }
  registry.set(kind, handler);
}

export function getHandler(kind: string): JobHandler | undefined {
  return registry.get(kind);
}

export function registeredKinds(): string[] {
  return [...registry.keys()].sort();
}
