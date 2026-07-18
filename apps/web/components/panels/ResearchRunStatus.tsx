'use client';

import { useEffect, useRef, useState } from 'react';
import { api, RequestError } from '@/lib/client';
import { toneFor } from './format';

export interface ResearchRunSnapshot {
  requestId: string;
  phase: string;
  evidenceCount: number;
  conceptCount: number;
  validationPassed: boolean | null;
  admissionApplied: string | null;
}

interface RunRow {
  id?: string;
  requestId?: string;
  phase?: string;
  status?: string;
  evidenceCount?: number;
  conceptCount?: number;
  validationPassed?: boolean;
  admissionApplied?: string | null;
  evidenceIds?: string[];
  conceptIds?: string[];
  validation?: { overallPass?: boolean };
}

function parseRun(row: RunRow): ResearchRunSnapshot {
  return {
    requestId: String(row.requestId ?? row.id ?? ''),
    phase: String(row.phase ?? row.status ?? 'unknown'),
    evidenceCount: Number(row.evidenceCount ?? row.evidenceIds?.length ?? 0),
    conceptCount: Number(row.conceptCount ?? row.conceptIds?.length ?? 0),
    validationPassed:
      typeof row.validationPassed === 'boolean'
        ? row.validationPassed
        : (row.validation?.overallPass ?? null),
    admissionApplied: row.admissionApplied ?? null,
  };
}

function isTerminalPhase(phase: string): boolean {
  return phase === 'done' || phase === 'failed';
}

/**
 * Polls research runs after pollToken increments until a terminal phase or
 * maxAttempts is reached (pipeline gather→admit typically finishes in a few seconds).
 */
export function ResearchRunStatus(props: {
  companyId: string;
  moduleId?: string;
  pollToken: number;
  onRun?: (run: ResearchRunSnapshot) => void;
}) {
  const [run, setRun] = useState<ResearchRunSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const onRunRef = useRef(props.onRun);
  onRunRef.current = props.onRun;

  useEffect(() => {
    if (!props.pollToken || !props.companyId) return;
    setMessage(null);
    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 6;
    const delaysMs = [1500, 2500, 3500, 4000, 5000, 5000];

    async function fetchOnce(): Promise<ResearchRunSnapshot | null> {
      const qs = props.moduleId ? `?moduleId=${props.moduleId}` : '';
      const data = await api<{ runs: RunRow[] }>(
        `/api/companies/${props.companyId}/research/runs${qs}`,
      );
      const latest = data.runs?.[0];
      if (!latest) return null;
      return parseRun(latest);
    }

    async function tick() {
      if (cancelled) return;
      attempt += 1;
      try {
        const snapshot = await fetchOnce();
        if (cancelled) return;
        if (!snapshot) {
          setMessage('No runs recorded yet.');
          setRun(null);
          if (attempt < maxAttempts) {
            window.setTimeout(() => void tick(), delaysMs[attempt - 1] ?? 4000);
          }
          return;
        }
        setMessage(null);
        setRun(snapshot);
        onRunRef.current?.(snapshot);
        if (!isTerminalPhase(snapshot.phase) && attempt < maxAttempts) {
          window.setTimeout(() => void tick(), delaysMs[attempt - 1] ?? 4000);
        }
      } catch (err) {
        if (cancelled) return;
        setRun(null);
        setMessage(
          err instanceof RequestError && err.status === 404
            ? 'Runs API not available yet.'
            : 'Could not load run status.',
        );
      }
    }

    const first = window.setTimeout(() => void tick(), delaysMs[0] ?? 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
  }, [props.pollToken, props.companyId, props.moduleId]);

  if (!props.pollToken) return null;
  if (message) {
    return <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">{message}</p>;
  }
  if (!run) {
    return <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">Checking run status…</p>;
  }

  const validationLabel =
    run.validationPassed === null
      ? 'validation pending'
      : run.validationPassed
        ? 'validation passed'
        : 'validation failed';

  const admissionLabel = run.admissionApplied ? run.admissionApplied.replace(/_/g, ' ') : null;

  return (
    <div
      className="mt-1.5 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[10px] text-[var(--color-ink-dim)]"
      aria-live="polite"
      aria-label={`Research run ${run.phase}`}
    >
      <span className="text-[var(--color-ink)]">{run.phase}</span>
      <span className="mx-1 text-[var(--color-ink-faint)]">·</span>
      <span>{run.evidenceCount} evidence</span>
      <span className="mx-1 text-[var(--color-ink-faint)]">·</span>
      <span>{run.conceptCount} concepts</span>
      <span className="mx-1 text-[var(--color-ink-faint)]">·</span>
      <span style={{ color: toneFor(run.validationPassed ? 'pass' : 'fail') }}>
        {validationLabel}
      </span>
      {admissionLabel && (
        <>
          <span className="mx-1 text-[var(--color-ink-faint)]">·</span>
          <span>admission {admissionLabel}</span>
        </>
      )}
    </div>
  );
}
