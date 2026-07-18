'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TraceValueRefs } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { dispatchValueLineageFocus } from '@/lib/value-lineage-focus';
import { stageTone } from './format';

interface TimelineEntry {
  stage: 'lead' | 'tree' | 'compile' | 'task' | 'trace' | 'verification' | 'ledger';
  at: string;
  status: string;
  summary: string;
  refId: string;
}

/**
 * Overlay modal showing the full decision trace for one execution: every
 * pipeline stage (lead → tree → compile → task → trace → verification →
 * ledger) as a vertical timeline, ordered as delivered by the API.
 * ValueRef deep links open the right-panel Values tab lineage walk.
 */
export function TraceTimeline(props: {
  companyId: string;
  traceId: string;
  onClose: () => void;
}) {
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [valueRefs, setValueRefs] = useState<TraceValueRefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { onClose } = props;

  useEffect(() => {
    let cancelled = false;
    api<{ timeline: TimelineEntry[]; valueRefs: TraceValueRefs | null }>(
      `/api/companies/${props.companyId}/traces/${props.traceId}/timeline`,
    )
      .then((data) => {
        if (cancelled) return;
        setTimeline(data.timeline);
        setValueRefs(data.valueRefs ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof RequestError && err.status === 404
            ? 'Trace detail unavailable — the timeline service is not deployed yet.'
            : 'Could not load the trace timeline.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [props.companyId, props.traceId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stopPropagation = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  function openLineage(ref: string) {
    dispatchValueLineageFocus({ companyId: props.companyId, valueRef: ref });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Decision trace timeline"
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 shadow-xl"
        onClick={stopPropagation}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-ink)]">Decision trace</h2>
            <p className="font-mono text-[10px] text-[var(--color-ink-faint)]">{props.traceId}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close trace timeline"
            className="rounded px-2 py-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            ×
          </button>
        </div>

        {error && <p className="py-4 text-xs text-[var(--color-ink-faint)]">{error}</p>}

        {!error && timeline === null && (
          <p className="py-4 text-xs text-[var(--color-ink-faint)]">Loading trace…</p>
        )}

        {!error && timeline !== null && timeline.length === 0 && (
          <p className="py-4 text-xs text-[var(--color-ink-faint)]">
            No timeline entries recorded for this trace.
          </p>
        )}

        {!error && timeline !== null && timeline.length > 0 && (
          <>
            <ol className="space-y-0">
              {timeline.map((entry, i) => (
                <li key={`${entry.stage}-${entry.refId}-${i}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: stageTone(entry.status) }}
                      aria-hidden="true"
                    />
                    {i < timeline.length - 1 && (
                      <span className="w-px flex-1 bg-[var(--color-line)]" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 pb-4">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="font-medium uppercase tracking-wide text-[var(--color-ink)]">
                        {entry.stage}
                      </span>
                      <span style={{ color: stageTone(entry.status) }}>{entry.status}</span>
                      <span className="text-[10px] text-[var(--color-ink-faint)]">
                        {new Date(entry.at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--color-ink-dim)]">{entry.summary}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--color-ink-faint)]">
                      {entry.refId}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {valueRefs && (
              <div className="mt-2 border-t border-[var(--color-line)] pt-3">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                  Value lineage
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openLineage(valueRefs.quantityRef)}
                    aria-label={`Show lineage for quantity value ${valueRefs.quantityRef}`}
                    className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    Quantity lineage
                  </button>
                  {valueRefs.limitPriceRef && (
                    <button
                      type="button"
                      onClick={() => openLineage(valueRefs.limitPriceRef!)}
                      aria-label={`Show lineage for limit price value ${valueRefs.limitPriceRef}`}
                      className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    >
                      Limit price lineage
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openLineage(valueRefs.fillTimeoutRef)}
                    aria-label={`Show lineage for fill timeout value ${valueRefs.fillTimeoutRef}`}
                    className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    Fill timeout lineage
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
