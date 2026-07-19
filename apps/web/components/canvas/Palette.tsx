'use client';

import { useEffect, useState } from 'react';
import {
  defaultEngineCapitalEnvelope,
  defaultTargetExitLocal,
  moduleFunctionLabel,
  requiredModuleSetupFields,
  type EngineTemplate,
  type ModuleSetupField,
  type ModuleSetupInput,
  type ModuleType,
} from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  EMPTY_MODULE_SETUP_DRAFT,
  ModuleSetupFields,
  missingFieldsFromDraft,
  moduleSetupInputFromDraft,
  type ModuleSetupDraft,
} from './ModuleSetupFields';
import { MODULE_VISUALS } from './types';

/** Default configs satisfying each type's contract schema (minimum viable). */
const ADDABLE: Array<{
  type: ModuleType;
  defaultConfig: unknown;
  hint: string;
}> = [
  {
    type: 'research',
    defaultConfig: {
      topicScope: 'General market research',
      researchSubtype: 'external_web',
      curiosity: 'exploratory',
    },
    hint: 'Web discover curator → libraries',
  },
  {
    type: 'librarian',
    defaultConfig: {
      topicScope: 'General library curation',
      librarianSubtype: 'librarian_relevance',
    },
    hint: 'Relevance librarian + topic hygiene',
  },
  {
    type: 'library',
    defaultConfig: {
      topicScope: 'General',
      libraryClass: 'topic_runtime',
      masterLibrary: false,
    },
    hint: 'Topic runtime knowledge store',
  },
  {
    type: 'live_api',
    defaultConfig: {
      sourceKind: 'alpaca_bars',
      venue: 'alpaca',
      instruments: ['SPY'],
      feedClass: 'iex_free',
      pollSeconds: 60,
    },
    hint: 'Hydrator-bound live feed (sourceKind)',
  },
  {
    type: 'trend',
    defaultConfig: {
      focus: 'Broad market momentum',
      trendPosture: 'session_intraday',
      maxActiveTrends: 10,
      cadenceMinutes: 30,
    },
    hint: 'Intraday tradeable trends',
  },
  {
    type: 'trading',
    defaultConfig: { subtype: 'day', strategyFamilies: ['strat-001'], exitTimelineDays: 1 },
    hint: 'Paper day-trade execution',
  },
  {
    type: 'policy',
    defaultConfig: {
      policyEnvelopeRef: 'paper_balanced_general_v1',
      notes: 'Fail-closed paper policy verification.',
    },
    hint: 'Policy / verification envelope',
  },
  {
    type: 'simulator',
    defaultConfig: {},
    hint: 'Paper-tests strategies',
  },
  {
    type: 'analyzer',
    defaultConfig: {
      emitMode: 'verify_loopback',
      streamDescriptor: 'manual_exec_monitor',
    },
    hint: 'Execution verify / research concat',
  },
  {
    type: 'holding_fund',
    defaultConfig: {
      source: 'company_seed',
      allocationPolicyRef: 'paper_balanced_general_v1',
    },
    hint: 'Company seed capital pool',
  },
  {
    type: 'fund_router',
    defaultConfig: {
      policyEnvelopeRef: 'paper_balanced_general_v1',
      approvalMode: 'manual',
      targetModuleIds: [],
    },
    hint: 'Deterministic capital router',
  },
  {
    type: 'display',
    defaultConfig: { displayKind: 'table', title: 'Operations Table' },
    hint: 'Graphs, lists, tables, ledgers',
  },
  {
    type: 'math',
    defaultConfig: { mathType: 'company_hub' },
    hint: 'Repeatable calculator; attach to many nodes (D-028)',
  },
  {
    type: 'clock',
    defaultConfig: { timezone: 'America/New_York', displayMode: 'session' },
    hint: 'Company Master Clock (singleton temporal authority)',
  },
  {
    type: 'time',
    defaultConfig: { transform: 'session_window', descriptor: 'session cadence window' },
    hint: 'Temporal processor: elapsed, TZ, schedule, session',
  },
];

/** Store categories (DevSpecs/dev-notebook.md: divide nodes by category). */
const CATEGORIES: Array<{ label: string; types: ModuleType[] }> = [
  { label: 'Research & knowledge', types: ['research', 'librarian', 'library'] },
  { label: 'Data', types: ['live_api'] },
  { label: 'Signals', types: ['trend'] },
  { label: 'Trading', types: ['trading'] },
  { label: 'Funds & controls', types: ['holding_fund', 'fund_router', 'policy'] },
  { label: 'Tools', types: ['math', 'clock', 'time'] },
  { label: 'Utilities', types: ['simulator', 'analyzer'] },
  { label: 'Display', types: ['display'] },
];

type StoreSection = 'modules' | 'engines';

export type CompanyEngineDefaults = {
  sectorFocuses: string[];
  seedCreditsCents: number;
};

/**
 * Floating module/engine store (top-left). Two launcher buttons open the same
 * store on Modules or Engines; engines are browsed and inserted from here.
 */
export function Palette(props: {
  onAdd: (type: ModuleType, name: string, config: unknown) => void;
  onInsertEngine: (
    engine: EngineTemplate,
    inputs: Record<string, string>,
    setup?: ModuleSetupInput,
    options?: { cascadeFromCompany?: boolean },
  ) => Promise<void>;
  companyDefaults?: CompanyEngineDefaults;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<StoreSection>('modules');
  const [configuring, setConfiguring] = useState<EngineTemplate | null>(null);
  const [engineTemplates, setEngineTemplates] = useState<EngineTemplate[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(false);

  function openStore(next: StoreSection) {
    setSection(next);
    setConfiguring(null);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (configuring) {
        setConfiguring(null);
        return;
      }
      setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, configuring]);

  useEffect(() => {
    if (!open || section !== 'engines') return;
    let cancelled = false;
    setEnginesLoading(true);
    void api<{ templates: EngineTemplate[] }>('/api/engine-templates')
      .then((r) => {
        if (!cancelled) setEngineTemplates(r.templates);
      })
      .catch(() => {
        if (!cancelled) setEngineTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setEnginesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, section]);

  if (!open) {
    return (
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => openStore('modules')}
          aria-label="Open modules store"
          className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-1)]/90 px-3.5 py-2 text-xs text-[var(--color-ink-dim)] shadow-lg backdrop-blur hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
        >
          <span className="text-[var(--color-accent)]">+</span>
          Modules
        </button>
        <button
          type="button"
          onClick={() => openStore('engines')}
          aria-label="Open engines store"
          className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-1)]/90 px-3.5 py-2 text-xs text-[var(--color-ink-dim)] shadow-lg backdrop-blur hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
        >
          <span className="text-[var(--color-accent)]">+</span>
          Engines
        </button>
      </div>
    );
  }

  return (
    <aside
      className="absolute left-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-72 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)]/95 shadow-2xl backdrop-blur"
      aria-label={section === 'engines' ? 'Engines store' : 'Modules store'}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex gap-1">
          {(
            [
              { id: 'modules', label: 'Modules' },
              { id: 'engines', label: 'Engines' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSection(s.id);
                setConfiguring(null);
              }}
              className={`rounded px-2 py-0.5 text-[11px] ${
                section === s.id
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close store"
          className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {section === 'modules' &&
          CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-2">
              <div className="px-2 pb-1 pt-1.5 text-[9px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                {cat.label}
              </div>
              {cat.types.map((type) => {
                const entry = ADDABLE.find((a) => a.type === type);
                if (!entry) return null;
                const visual = MODULE_VISUALS[type];
                return (
                  <button
                    key={type}
                    onClick={() =>
                      props.onAdd(
                        type,
                        moduleFunctionLabel(type, entry.defaultConfig),
                        entry.defaultConfig,
                      )
                    }
                    className="group flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
                  >
                    <span className="flex items-center gap-2 text-sm text-[var(--color-ink-dim)] group-hover:text-[var(--color-ink)]">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: visual.hue }}
                      />
                      <span className="min-w-0 truncate">{visual.label}</span>
                      <span
                        className="ml-auto shrink-0 rounded px-1 py-0.5 text-[8px] uppercase tracking-wider"
                        style={{
                          color: visual.hue,
                          border: `1px solid ${visual.hue}55`,
                          background: `${visual.hue}12`,
                        }}
                      >
                        {visual.family === 'data_source'
                          ? 'Data'
                          : visual.family === 'agent'
                            ? 'Agent'
                            : visual.family === 'fund'
                              ? 'Vault'
                              : visual.family === 'tool'
                                ? 'Tool'
                                : 'Ctrl'}
                      </span>
                    </span>
                    <span className="pl-4 text-[10px] leading-tight text-[var(--color-ink-faint)]">
                      {entry.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

        {section === 'engines' && !configuring && (
          <div className="space-y-1.5">
            <p className="px-2 pb-1 text-[10px] leading-snug text-[var(--color-ink-faint)]">
              Insertable end-to-end engine templates. Engines are added from this store only.
            </p>
            {enginesLoading && (
              <p className="px-2 py-1 text-[10px] text-[var(--color-ink-faint)]">
                Loading engine catalog…
              </p>
            )}
            {!enginesLoading && engineTemplates.length === 0 && (
              <p className="px-2 py-2 text-[10px] text-[var(--color-warn)]">
                No engine templates available.
              </p>
            )}
            {!enginesLoading &&
              engineTemplates.map((engine) => (
                <button
                  key={engine.id}
                  type="button"
                  disabled={!engine.available}
                  onClick={() => setConfiguring(engine)}
                  className="w-full rounded-lg border border-[var(--color-line)] px-2.5 py-2 text-left hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-ink)]">{engine.label}</span>
                    {!engine.available && (
                      <span className="text-[9px] uppercase tracking-wide text-[var(--color-warn)]">
                        soon
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-faint)]">
                    {engine.available ? engine.description : engine.unavailableReason}
                  </p>
                </button>
              ))}
          </div>
        )}

        {section === 'engines' && configuring && (
          <EngineConfigForm
            engine={configuring}
            {...(props.companyDefaults ? { companyDefaults: props.companyDefaults } : {})}
            onCancel={() => setConfiguring(null)}
            onInsert={async (inputs, setup, options) => {
              await props.onInsertEngine(configuring, inputs, setup, options);
              setConfiguring(null);
              setOpen(false);
            }}
          />
        )}
      </div>
    </aside>
  );
}

/** Collects the engine's required user inputs before insertion. */
function EngineConfigForm(props: {
  engine: EngineTemplate;
  companyDefaults?: CompanyEngineDefaults;
  onCancel: () => void;
  onInsert: (
    inputs: Record<string, string>,
    setup?: ModuleSetupInput,
    options?: { cascadeFromCompany?: boolean },
  ) => Promise<void>;
}) {
  const [cascadeFromCompany, setCascadeFromCompany] = useState(true);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.engine.inputs.map((i) => [i.key, i.options?.[0] ?? ''])),
  );

  function draftFromCascade(cascade: boolean): ModuleSetupDraft {
    const seedCents = cascade ? (props.companyDefaults?.seedCreditsCents ?? 0) : 0;
    const envelope = defaultEngineCapitalEnvelope(seedCents);
    const topics =
      cascade && (props.companyDefaults?.sectorFocuses.length ?? 0) > 0
        ? props.companyDefaults!.sectorFocuses.join(', ')
        : '';
    return {
      ...EMPTY_MODULE_SETUP_DRAFT,
      topicSectors: topics,
      allocationMode: envelope.mode,
      allocationValue: envelope.value,
      targetExitLocal: defaultTargetExitLocal(),
    };
  }

  const [setupDraft, setSetupDraft] = useState<ModuleSetupDraft>(() =>
    draftFromCascade(true),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engineInputs = props.engine.inputs.filter(
    (input) => input.key !== 'focus' && input.key !== 'topicScope',
  );
  const requiredSetupFields = [
    ...new Set(props.engine.modules.flatMap((module) => requiredModuleSetupFields(module.type))),
  ] as ModuleSetupField[];
  const missingSetupFields = missingFieldsFromDraft(requiredSetupFields, setupDraft);
  const missingEngineInputs = engineInputs.some((input) => !values[input.key]?.trim());

  function handleCascadeToggle(next: boolean) {
    setCascadeFromCompany(next);
    setSetupDraft(draftFromCascade(next));
  }

  async function insert(skipSetup: boolean) {
    setBusy(true);
    setError(null);
    try {
      await props.onInsert(
        values,
        skipSetup ? undefined : moduleSetupInputFromDraft(setupDraft, requiredSetupFields),
        { cascadeFromCompany },
      );
    } catch {
      setError('Insert failed — some modules may have been created.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-1">
      <div>
        <div className="text-sm text-[var(--color-ink)]">{props.engine.label}</div>
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-faint)]">
          {props.engine.description}
        </p>
      </div>
      <label className="flex items-start gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5">
        <input
          type="checkbox"
          checked={cascadeFromCompany}
          onChange={(event) => handleCascadeToggle(event.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[10px] leading-snug text-[var(--color-ink-dim)]">
          Cascade from company (default). Prefills topic/sectors from company sector focuses and
          capital from paper seed; then cascades to engine members.
        </span>
      </label>
      {engineInputs.map((input) => (
        <label key={input.key} className="block space-y-1">
          <span className="text-[11px] text-[var(--color-ink-dim)]">{input.label}</span>
          {input.kind === 'select' ? (
            <select
              value={values[input.key]}
              onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none"
            >
              {input.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={values[input.key]}
              onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
              placeholder={input.placeholder}
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
            />
          )}
        </label>
      ))}
      <p className="text-[10px] leading-snug text-[var(--color-ink-faint)]">
        Master topic/sector cascades to engine nodes (overridable). With company cascade on,
        capital defaults from paper seed (else 100% envelope), split equally across
        capital-bearing members; exit defaults to one week ahead.
      </p>
      <ModuleSetupFields
        requiredFields={requiredSetupFields}
        missingFields={missingSetupFields}
        draft={setupDraft}
        onChange={setSetupDraft}
        compact
      />
      <div className="flex gap-2">
        <button
          onClick={() => void insert(false)}
          disabled={busy || missingEngineInputs || missingSetupFields.length > 0}
          className="flex-1 rounded-md border border-[var(--color-accent)] px-2 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
        >
          {busy ? 'Inserting…' : 'Insert engine'}
        </button>
        <button
          onClick={() => void insert(true)}
          disabled={busy || missingEngineInputs}
          className="rounded-md border border-[var(--color-warn)] px-2 py-1.5 text-xs text-[var(--color-warn)] disabled:opacity-50"
        >
          Skip setup
        </button>
        <button
          onClick={props.onCancel}
          disabled={busy}
          className="rounded-md border border-[var(--color-line)] px-2 py-1.5 text-xs text-[var(--color-ink-dim)]"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-[var(--color-block)]">{error}</p>}
    </div>
  );
}
