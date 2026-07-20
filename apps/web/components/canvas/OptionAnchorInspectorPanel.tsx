'use client';

import {
  connectionModeForDecisionKind,
  describeDecisionConnectionMode,
  DECISION_HANDLE_EMIT_OUT,
  decisionOptionOutHandle,
  resolveDecisionOutboundTargets,
  type DecisionConnectionMode,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';
import { LeverTreeSection } from './LeverTreeSection';

/**
 * Floating inspector for a unified decision node (D-192 / D-222).
 * Supports full discerned usage: emit_decision vs route_data, option selection.
 */
export function OptionAnchorInspectorPanel(props: {
  companyId: string;
  anchor: OptionAnchorSpec;
  position: OptionAnchorPosition;
  siblings: OptionAnchorSpec[];
  /** Engine members for route destination labels. */
  members?: ReadonlyArray<{ id: string; type: string; name?: string }>;
  onClose: () => void;
  onFocusEngine?: (engineId: string) => void;
  onFocusModule?: (moduleId: string) => void;
  onPositionChange?: (anchorId: string, position: OptionAnchorPosition) => void;
  onSelectOption?: (decisionId: string, optionId: string) => void;
  onConnectionModeChange?: (
    decisionId: string,
    mode: DecisionConnectionMode,
  ) => void;
}) {
  const { anchor } = props;
  const options = anchor.options ?? [];
  const mode =
    anchor.connectionMode ?? connectionModeForDecisionKind(anchor.kind);
  const modeCopy = describeDecisionConnectionMode(mode);
  const members = props.members ?? [];
  const outbound = resolveDecisionOutboundTargets(anchor, members);
  const nameById = new Map(
    members.map((m) => [m.id, m.name ?? m.type] as const),
  );
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
      </dl>

      <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
        <span className="text-xs text-[var(--color-ink-dim)]">Connection mode</span>
        <p className="text-[10px] leading-snug text-[var(--color-ink-faint)]">
          {modeCopy.summary}
        </p>
        <div className="flex gap-1" role="group" aria-label="Decision connection mode">
          {(['emit_decision', 'route_data'] as const).map((candidate) => {
            const copy = describeDecisionConnectionMode(candidate);
            const selected = candidate === mode;
            return (
              <button
                key={candidate}
                type="button"
                disabled={!props.onConnectionModeChange}
                onClick={() => props.onConnectionModeChange?.(anchor.id, candidate)}
                className={`flex-1 rounded border px-2 py-1.5 text-[9px] uppercase tracking-wide ${
                  selected
                    ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                    : 'border-[var(--color-line)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                title={copy.summary}
              >
                {copy.label}
              </button>
            );
          })}
        </div>
      </div>

      {options.length > 0 ? (
        <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
            {mode === 'emit_decision' ? 'Choice (emitted)' : 'Route options'}
          </p>
          <ul className="space-y-1">
            {options.map((opt) => {
              const selected = opt.id === anchor.selectedOptionId;
              const target = outbound.find((row) => row.optionId === opt.id);
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={!props.onSelectOption}
                    onClick={() => props.onSelectOption?.(anchor.id, opt.id)}
                    className="flex w-full flex-col gap-0.5 rounded border px-2 py-1.5 text-left text-[10px] disabled:cursor-not-allowed"
                    style={{
                      borderColor: selected
                        ? 'var(--color-accent)'
                        : 'var(--color-line)',
                    }}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[var(--color-ink)]">{opt.label}</span>
                      <span className="shrink-0 font-mono text-[var(--color-ink-faint)]">
                        {mode === 'emit_decision'
                          ? DECISION_HANDLE_EMIT_OUT
                          : decisionOptionOutHandle(opt.id)}
                      </span>
                    </span>
                    {mode === 'route_data' && target && (
                      <span className="truncate text-[9px] text-[var(--color-ink-faint)]">
                        → {nameById.get(target.targetModuleId) ?? target.targetModuleId} ·{' '}
                        {target.targetLinkKind.replace(/_/g, ' ')}
                      </span>
                    )}
                    {mode === 'emit_decision' && selected && (
                      <span className="truncate text-[9px] text-[var(--color-ink-faint)]">
                        → owner · decision emit
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {mode === 'emit_decision' && outbound[0] && (
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          Emit path: {DECISION_HANDLE_EMIT_OUT} →{' '}
          {nameById.get(outbound[0].targetModuleId) ?? outbound[0].targetModuleId}
        </p>
      )}

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
