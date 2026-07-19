'use client';

import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import { ProcessingQueueModal } from '@/components/ProcessingQueueModal';

/**
 * Company ribbon entry for the processing queue board (D-193).
 * Simple textured control — depth lives in the modal, not the label.
 */
export function ProcessingQueueChip(props: { companyId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open processing queue"
        data-testid="processing-queue-chip"
        title="Open processing queue for this company"
        className={[
          'inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)]',
          'bg-[var(--color-surface-2)] px-2.5 py-1',
          'text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-dim)]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.35)]',
          'transition-[color,background-color,border-color,box-shadow,transform] duration-150',
          'hover:border-[var(--color-ink-faint)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-ink)]',
          'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_5px_rgba(0,0,0,0.4)]',
          'active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]',
          open
            ? 'border-[var(--color-accent)] text-[var(--color-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_color-mix(in_srgb,var(--color-accent)_40%,transparent)]'
            : '',
        ].join(' ')}
      >
        <ListOrdered className="size-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={1.75} />
        Processing queue
      </button>
      <ProcessingQueueModal
        companyId={props.companyId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
