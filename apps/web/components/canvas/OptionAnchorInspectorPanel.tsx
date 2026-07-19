'use client';

import type { OptionAnchorPosition, OptionAnchorSpec } from '@hftr/contracts';
import { LeverTreeSection } from './LeverTreeSection';

/**
 * Floating inspector for a unified decision node (D-192 / D-173).
 */
export function OptionAnchorInspectorPanel(props: {
  companyId: string;
  anchor: OptionAnchorSpec;
  position: OptionAnchorPosition;
  siblings: OptionAnchorSpec[];
  onClose: () => void;
  onFocusEngine?: (engineId: string) => void;
  onFocusModule?: (moduleId: string) => void;
  onPositionChange?: (anchorId: string, position: OptionAnchorPosition) => void;
}) {
  const { anchor } = props;
  const options = anchor.options ?? [];
  const related = props.siblings.filter(
    (entry) =>
      entry.id === anchor.id ||
      entry.ownerModuleId === anchor.ownerModuleId ||
      entry.id === anchor.parentAnchorId,
  );

  return (
    <aside
      className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4 shadow-2xl"
      aria-label="Decision node inspector"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            Decision node
          </p>
          <p className="text-sm text-[var(--color-ink)]">{anchor.label}</p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
        >
          Close
        </button>
      </div>

      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-ink-faint)]">Kind</dt>
          <dd className="text-[var(--color-ink-dim)]">{anchor.kind.replace(/_/g, ' ')}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-ink-faint)]">Catalog</dt>
          <dd className="truncate text-[var(--color-ink-dim)]" title={anchor.catalogRef}>
            {anchor.catalogRef}
          </dd>
        </div>
        {anchor.layer && (
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-ink-faint)]">Layer</dt>
            <dd className="text-[var(--color-ink-dim)]">{anchor.layer}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-ink-faint)]">Position</dt>
          <dd className="uppercase text-[var(--color-ink-dim)]">{props.position}</dd>
        </div>
        {anchor.selectedOptionId ? (
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-ink-faint)]">Selected</dt>
            <dd className="truncate text-[var(--color-ink-dim)]" title={anchor.selectedOptionId}>
              {options.find((opt) => opt.id === anchor.selectedOptionId)?.label ??
                anchor.selectedOptionId}
            </dd>
          </div>
        ) : null}
      </dl>

      {options.length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            Options (per-option outs)
          </p>
          <ul className="space-y-1">
            {options.map((opt) => (
              <li
                key={opt.id}
                className="flex items-center justify-between gap-2 rounded border border-[var(--color-line)] px-2 py-1 text-[10px]"
                style={{
                  borderColor:
                    opt.id === anchor.selectedOptionId
                      ? 'var(--color-accent)'
                      : 'var(--color-line)',
                }}
              >
                <span className="truncate text-[var(--color-ink)]">{opt.label}</span>
                <span className="shrink-0 font-mono text-[var(--color-ink-faint)]">
                  option-out:{opt.id}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => props.onFocusEngine?.(anchor.ownerEngineId)}
          className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]"
        >
          Focus engine
        </button>
        {anchor.ownerModuleId && (
          <button
            type="button"
            onClick={() => props.onFocusModule?.(anchor.ownerModuleId!)}
            className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]"
          >
            Focus owner module
          </button>
        )}
      </div>

      <LeverTreeSection
        companyId={props.companyId}
        engineId={anchor.ownerEngineId}
        {...(anchor.ownerModuleId ? { moduleId: anchor.ownerModuleId } : {})}
        anchors={related.length > 0 ? related : [anchor]}
        positions={{ [anchor.id]: props.position }}
        manualControl
        {...(props.onPositionChange ? { onPositionChange: props.onPositionChange } : {})}
      />
    </aside>
  );
}
