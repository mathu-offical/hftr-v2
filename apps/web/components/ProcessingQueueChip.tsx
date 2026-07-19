'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ProcessingQueueModal,
  countProcessingJobs,
  fetchCompanyProcessingJobs,
  type ProcessingQueueCounts,
} from '@/components/ProcessingQueueModal';

/**
 * Company ribbon entry for the processing queue board (D-193).
 * Text-first label from company pending/dead jobs; opens column modal.
 */
export function ProcessingQueueChip(props: { companyId: string }) {
  const [counts, setCounts] = useState<ProcessingQueueCounts | null>(null);
  const [open, setOpen] = useState(false);

  const tick = useCallback(async () => {
    try {
      const data = await fetchCompanyProcessingJobs(props.companyId);
      setCounts(countProcessingJobs(data.pending, data.dead));
    } catch {
      setCounts(null);
    }
  }, [props.companyId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const data = await fetchCompanyProcessingJobs(props.companyId);
        if (!cancelled) setCounts(countProcessingJobs(data.pending, data.dead));
      } catch {
        if (!cancelled) setCounts(null);
      }
    }
    void run();
    const t = setInterval(() => void run(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [props.companyId]);

  useEffect(() => {
    if (!open) void tick();
  }, [open, tick]);

  const busy = counts ? counts.pending + counts.active : null;
  const label =
    counts === null
      ? 'Processing queue'
      : busy === 0
        ? 'Processing queue · idle'
        : `Processing queue · ${counts.pending} pending · ${counts.active} active`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open processing queue"
        data-testid="processing-queue-chip"
        className="status-chip font-mono hover:bg-[var(--color-surface-2)]"
        title="Processing queue for this company"
      >
        {label}
        {counts && counts.dead > 0 ? (
          <span className="text-[var(--color-block)]"> · {counts.dead} dead</span>
        ) : null}
      </button>
      <ProcessingQueueModal
        companyId={props.companyId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
