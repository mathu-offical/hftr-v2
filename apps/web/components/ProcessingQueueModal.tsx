'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { QueueClass, type QueueClass as QueueClassT } from '@hftr/contracts';
import { api } from '@/lib/client';
import { InlineLoadingStrip } from '@/components/shell/LoadingChrome';

export type ProcessingQueuePendingJob = {
  id: string;
  kind: string;
  queueClass: string;
  moduleId: string | null;
  status: 'pending' | 'active';
  attempts: number;
  runAfter: string;
  updatedAt: string;
};

export type ProcessingQueueDeadJob = {
  id: string;
  kind: string;
  queueClass: string;
  moduleId: string | null;
  lastError: string | null;
  attempts: number;
  updatedAt: string;
};

export type ProcessingQueueJobCard =
  | (ProcessingQueuePendingJob & { status: 'pending' | 'active' })
  | (ProcessingQueueDeadJob & { status: 'dead' });

export type ProcessingQueueCounts = {
  pending: number;
  active: number;
  dead: number;
};

const QUEUE_LANES = QueueClass.options as readonly QueueClassT[];

const LANE_ABBREV: Record<QueueClassT, string> = {
  RESEARCH: 'RSH',
  LIBRARY_RESEARCH: 'LIB',
  POSTURE_RESEARCH: 'PST',
  STRATEGIC: 'STR',
  TACTICAL: 'TAC',
  COMPILE: 'CMP',
  DISPATCH: 'DSP',
  VERIFY: 'VRF',
  TRAINING: 'TRN',
  ASSISTANT: 'AST',
  BILLING: 'BIL',
  MAINTENANCE: 'MNT',
};

export async function fetchCompanyProcessingJobs(companyId: string): Promise<{
  pending: ProcessingQueuePendingJob[];
  dead: ProcessingQueueDeadJob[];
}> {
  const base = `/api/companies/${companyId}`;
  const [pendingRes, deadRes] = await Promise.all([
    api<{ jobs: ProcessingQueuePendingJob[] }>(`${base}/jobs/pending`),
    api<{ jobs: ProcessingQueueDeadJob[] }>(`${base}/jobs/dead`),
  ]);
  return { pending: pendingRes.jobs, dead: deadRes.jobs };
}

export function countProcessingJobs(
  pending: ProcessingQueuePendingJob[],
  dead: ProcessingQueueDeadJob[],
): ProcessingQueueCounts {
  return {
    pending: pending.filter((j) => j.status === 'pending').length,
    active: pending.filter((j) => j.status === 'active').length,
    dead: dead.length,
  };
}

function statusLabel(status: ProcessingQueueJobCard['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'active':
      return 'Active';
    case 'dead':
      return 'Dead';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Company-scoped processing queue board (D-193): columns per QueueClass.
 */
export function ProcessingQueueModal(props: {
  companyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<ProcessingQueuePendingJob[]>([]);
  const [dead, setDead] = useState<ProcessingQueueDeadJob[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const data = await fetchCompanyProcessingJobs(props.companyId);
      setPending(data.pending);
      setDead(data.dead);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [props.companyId]);

  useEffect(() => {
    if (!props.open) return;
    setLoadState('loading');
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [props.open, load]);

  useEffect(() => {
    if (!props.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);

  const byLane = useMemo(() => {
    const map = new Map<string, ProcessingQueueJobCard[]>();
    for (const lane of QUEUE_LANES) map.set(lane, []);
    for (const j of pending) {
      const list = map.get(j.queueClass) ?? [];
      list.push(j);
      map.set(j.queueClass, list);
    }
    for (const j of dead) {
      const list = map.get(j.queueClass) ?? [];
      list.push({ ...j, status: 'dead' });
      map.set(j.queueClass, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return map;
  }, [pending, dead]);

  const totals = countProcessingJobs(pending, dead);

  if (!props.open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={props.onClose}
      role="presentation"
      data-testid="processing-queue-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Processing queue"
        data-testid="processing-queue-modal"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(40rem,90vh)] w-[min(96rem,95vw)] flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-2xl"
      >
        <header className="shrink-0 border-b border-[var(--color-line)] px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-[var(--color-ink)]">Processing queue</h2>
              <p className="mt-0.5 font-mono text-[11px] text-[var(--color-ink-faint)]">
                This company · {totals.pending} pending · {totals.active} active
                {totals.dead > 0 ? (
                  <span className="text-[var(--color-block)]"> · {totals.dead} dead</span>
                ) : null}
                {' · '}
                Dead-letter retry remains on the bottom Dead letters tab.
              </p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close processing queue"
              className="shrink-0 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 py-3">
          {loadState === 'loading' && pending.length === 0 && dead.length === 0 ? (
            <div className="px-2 py-1" data-testid="processing-queue-loading">
              <InlineLoadingStrip label="Queue" detail="fetching" />
            </div>
          ) : loadState === 'error' && pending.length === 0 && dead.length === 0 ? (
            <p className="px-2 text-xs text-[var(--color-block)]">
              Could not load processing queue for this company.
            </p>
          ) : (
            <div className="flex h-full min-w-min gap-2">
              {QUEUE_LANES.map((lane) => {
                const jobs = byLane.get(lane) ?? [];
                const pendingN = jobs.filter((j) => j.status === 'pending').length;
                const activeN = jobs.filter((j) => j.status === 'active').length;
                const deadN = jobs.filter((j) => j.status === 'dead').length;
                return (
                  <section
                    key={lane}
                    data-testid={`processing-queue-lane-${lane}`}
                    className="flex h-full w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)]"
                  >
                    <header className="shrink-0 border-b border-[var(--color-line)] px-2.5 py-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-dim)]">
                        {LANE_ABBREV[lane]}
                      </div>
                      <div
                        className="truncate text-xs font-medium text-[var(--color-ink)]"
                        title={lane}
                      >
                        {lane.replaceAll('_', ' ')}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-[var(--color-ink-faint)]">
                        {jobs.length === 0
                          ? 'Idle'
                          : `${pendingN}p · ${activeN}a${deadN > 0 ? ` · ${deadN}d` : ''}`}
                      </div>
                    </header>
                    <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2">
                      {jobs.length === 0 ? (
                        <li className="px-1 py-2 text-[10px] text-[var(--color-ink-faint)]">
                          No jobs
                        </li>
                      ) : (
                        jobs.map((job) => (
                          <li
                            key={job.id}
                            data-testid="processing-queue-job"
                            data-status={job.status}
                            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5"
                          >
                            <div className="truncate font-mono text-[11px] text-[var(--color-ink)]">
                              {job.kind}
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-1">
                              <span
                                className={`text-[10px] font-medium uppercase tracking-wide ${
                                  job.status === 'dead'
                                    ? 'text-[var(--color-block)]'
                                    : job.status === 'active'
                                      ? 'text-[var(--color-accent)]'
                                      : 'text-[var(--color-ink-dim)]'
                                }`}
                              >
                                {statusLabel(job.status)}
                              </span>
                              <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                                ×{job.attempts}
                              </span>
                            </div>
                            {job.status === 'dead' && job.lastError ? (
                              <p
                                className="mt-1 line-clamp-2 text-[10px] text-[var(--color-block)]"
                                title={job.lastError}
                              >
                                {job.lastError}
                              </p>
                            ) : null}
                            <div className="mt-1 font-mono text-[9px] text-[var(--color-ink-faint)]">
                              {formatUpdated(job.updatedAt)}
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
