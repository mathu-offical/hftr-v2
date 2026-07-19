'use client';

import type { MarketHubSourceChip } from '@hftr/contracts';
import { sourceChipClassWord } from '@/lib/market-hub-source-chips';

/**
 * Extremely lightweight provenance chips (D-155).
 * Each chip says class (api|library|system|setting) + short label.
 * Shown when at least one confirming source exists; multi-source = multiple chips.
 */
export function SourceVerifyChips(props: {
  chips: MarketHubSourceChip[];
  /** When true, hide if fewer than 2 chips (multi-confirm only). Default false. */
  multiOnly?: boolean;
  className?: string;
  'data-testid'?: string;
}) {
  const chips = props.chips ?? [];
  if (chips.length === 0) return null;
  if (props.multiOnly && chips.length < 2) return null;

  return (
    <ul
      className={`flex flex-wrap gap-0.5 ${props.className ?? ''}`}
      aria-label="Verifying sources"
      data-testid={props['data-testid'] ?? 'source-verify-chips'}
    >
      {chips.map((chip) => (
        <li key={chip.id}>
          <span
            className="inline-flex max-w-[9rem] items-baseline gap-0.5 truncate rounded border border-[var(--color-line)] px-1 py-px font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]"
            title={`${sourceChipClassWord(chip.class)} · ${chip.label}`}
          >
            <span className="text-[var(--color-ink-dim)]">{sourceChipClassWord(chip.class)}</span>
            <span className="normal-case tracking-normal text-[var(--color-ink-faint)]">
              {chip.label}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
