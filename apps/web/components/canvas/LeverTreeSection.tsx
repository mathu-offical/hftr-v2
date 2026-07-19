'use client';

import {
  optionAnchorCatalogSlice,
  type OptionAnchorKind,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';

const KIND_LABELS: Record<OptionAnchorKind, string> = {
  template_input: 'Template inputs',
  strategy_family: 'Strategy families',
  branch_role: 'Branch roles',
  lever_band: 'Lever bands',
  recovery_phase: 'Recovery phases',
  philosophy_axis: 'Philosophy axes',
  research_subtype: 'Research subtypes',
  curiosity_band: 'Curiosity bands',
  librarian_subtype: 'Librarian subtypes',
  library_class: 'Library classes',
  trend_posture: 'Trend postures',
  cadence_band: 'Cadence bands',
  admission_mode: 'Admission modes',
  emit_mode: 'Emit modes',
};

const POSITION_OPTIONS: OptionAnchorPosition[] = ['min', 'typical', 'max'];

function humanizeKindChip(kind: OptionAnchorKind): string {
  return kind.replace(/_/g, ' ');
}

function anchorCatalogHint(anchor: OptionAnchorSpec): string | null {
  const slice = optionAnchorCatalogSlice();
  switch (anchor.kind) {
    case 'branch_role': {
      const branchId = anchor.catalogRef.split('/').pop();
      const branch = slice.branchTypes?.find((entry) => entry.id === branchId);
      return branch?.role ?? null;
    }
    case 'recovery_phase': {
      const templateId = anchor.catalogRef.split('/')[0];
      const template = slice.recoveryLadderTemplates?.find((entry) => entry.id === templateId);
      return template?.name ?? null;
    }
    case 'template_input':
    case 'strategy_family':
    case 'lever_band':
    case 'philosophy_axis':
    case 'research_subtype':
    case 'curiosity_band':
    case 'librarian_subtype':
    case 'library_class':
    case 'trend_posture':
    case 'cadence_band':
    case 'admission_mode':
    case 'emit_mode':
      return null;
    default: {
      const _exhaustive: never = anchor.kind;
      return _exhaustive;
    }
  }
}

function PositionToggle(props: {
  anchorId: string;
  value: OptionAnchorPosition;
  disabled: boolean;
  onChange?: (anchorId: string, position: OptionAnchorPosition) => void;
}) {
  return (
    <div
      className="flex gap-0.5"
      role="group"
      aria-label="Lever band position"
    >
      {POSITION_OPTIONS.map((position) => (
        <button
          key={position}
          type="button"
          disabled={props.disabled}
          onClick={() => props.onChange?.(props.anchorId, position)}
          className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
            props.value === position
              ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
              : 'border-[var(--color-line)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {position}
        </button>
      ))}
    </div>
  );
}

function supportsPositionToggle(kind: OptionAnchorKind): boolean {
  return (
    kind === 'lever_band' ||
    kind === 'philosophy_axis' ||
    kind === 'curiosity_band' ||
    kind === 'cadence_band'
  );
}

export function LeverTreeSection(props: {
  companyId: string;
  moduleId?: string;
  engineId?: string;
  anchors: OptionAnchorSpec[];
  positions?: Record<string, OptionAnchorPosition>;
  manualControl?: boolean;
  onPositionChange?: (anchorId: string, position: OptionAnchorPosition) => void;
}) {
  const disabled = props.manualControl === false;
  const grouped = new Map<OptionAnchorKind, OptionAnchorSpec[]>();

  for (const anchor of props.anchors) {
    const list = grouped.get(anchor.kind) ?? [];
    list.push(anchor);
    grouped.set(anchor.kind, list);
  }

  const kinds = [...grouped.keys()].sort((a, b) =>
    KIND_LABELS[a].localeCompare(KIND_LABELS[b]),
  );

  return (
    <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
      <div className="space-y-0.5">
        <span className="text-xs text-[var(--color-ink-dim)]">Option anchors</span>
        <p className="text-[10px] leading-snug text-[var(--color-ink-faint)]">
          Text-first lever positions inside bounded envelopes. No raw financial numbers.
        </p>
      </div>

      {disabled && (
        <p className="text-[10px] text-[var(--color-warn)]">
          Manual control is off — enable it in configuration to adjust lever positions.
        </p>
      )}

      {kinds.length === 0 ? (
        <p className="text-[11px] text-[var(--color-ink-faint)]">No anchors for this module yet.</p>
      ) : (
        kinds.map((kind) => {
          const sectionAnchors = grouped.get(kind) ?? [];
          return (
            <section key={kind} className="space-y-1.5">
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
                {KIND_LABELS[kind]}
              </h4>
              <ul className="space-y-1">
                {sectionAnchors.map((anchor) => {
                  const position =
                    props.positions?.[anchor.id] ??
                    anchor.defaultPosition ??
                    'typical';
                  const hint = anchorCatalogHint(anchor);
                  const showToggle = supportsPositionToggle(anchor.kind);

                  return (
                    <li
                      key={anchor.id}
                      className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="rounded border border-[var(--color-line)] px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                              {humanizeKindChip(anchor.kind)}
                            </span>
                            {!showToggle && (
                              <span className="rounded border border-[var(--color-line)] px-1 py-0.5 text-[8px] uppercase tracking-wide text-[var(--color-ink-dim)]">
                                {position}
                              </span>
                            )}
                          </div>
                          <p
                            className="truncate text-[11px] text-[var(--color-ink)]"
                            title={anchor.label}
                          >
                            {anchor.label}
                          </p>
                          {hint && (
                            <p className="text-[9px] text-[var(--color-ink-faint)]">{hint}</p>
                          )}
                        </div>
                        {showToggle && (
                          <PositionToggle
                            anchorId={anchor.id}
                            value={position}
                            disabled={disabled}
                            {...(props.onPositionChange
                              ? { onChange: props.onPositionChange }
                              : {})}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
