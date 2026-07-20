'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_EXECUTION_SIM_COUNT,
  defaultEngineCapitalEnvelope,
  defaultTargetExitLocal,
  engineCreateSection,
  getEngineTemplateById,
  moduleFunctionLabel,
  requiredModuleSetupFields,
  simulationRoleForPlacement,
  type EngineCreateSection,
  type EngineTemplate,
  type ModuleSetupField,
  type ModuleSetupInput,
  type ModuleType,
  type ResearchLibraryBinding,
  type SimulationEngineBinding,
  type SimulationPlacement,
} from '@hftr/contracts';
import { api } from '@/lib/client';
import {
  buildCanvasEngineOutline,
  buildCanvasModuleOutline,
  type CanvasEngineOutlineItem,
} from '@/lib/canvas-engine-outline';
import {
  EMPTY_MODULE_SETUP_DRAFT,
  ModuleSetupFields,
  missingFieldsFromDraft,
  moduleSetupInputFromDraft,
  type ModuleSetupDraft,
} from './ModuleSetupFields';
import { MODULE_VISUALS } from './types';

const ENGINE_STORE_SECTIONS: ReadonlyArray<{
  id: EngineCreateSection;
  label: string;
  hint: string;
}> = [
  {
    id: 'research',
    label: 'Research',
    hint: 'Data / evidence packs that feed execution desks.',
  },
  {
    id: 'execution',
    label: 'Execution',
    hint: 'Trading desks — auto-queues research deps + default sim children.',
  },
  {
    id: 'simulation',
    label: 'Simulation',
    hint: 'Paper gate (pre), training (post), or adhoc sim desks.',
  },
];

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
    defaultConfig: { mathType: 'engine_math_hub' },
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

type StoreSection = 'engines' | 'modules';
type PanelView = 'inventory' | 'store';

export type CompanyEngineDefaults = {
  sectorFocuses: string[];
  seedCreditsCents: number;
};

export type PaletteCanvasModule = {
  id: string;
  name: string;
  type: ModuleType;
  /** D-215 — ENGINE membership for inventory scoping. */
  engineInstanceId?: string | null;
};

export type PaletteCanvasEngine = CanvasEngineOutlineItem;

/**
 * Floating engines/modules chrome (top-left, D-204).
 * Unified segmented launcher (engines first). Default panel lists canvas
 * structures; **Add new** opens the existing store catalog.
 */
export function Palette(props: {
  onAdd: (type: ModuleType, name: string, config: unknown) => void;
  onInsertEngine: (
    engine: EngineTemplate,
    inputs: Record<string, string>,
    setup?: ModuleSetupInput,
    options?: {
      cascadeFromCompany?: boolean;
      simulationBinding?: SimulationEngineBinding;
      /** D-189: child sim count when inserting execution (default 2). */
      simCount?: number;
      /** D-184 §1: research pack library / hub binding. */
      researchLibraryBinding?: ResearchLibraryBinding;
    },
  ) => Promise<void>;
  companyDefaults?: CompanyEngineDefaults;
  /** Existing execution engines for linking sims (D-189). */
  executionEngines?: ReadonlyArray<{ id: string; label: string }>;
  /** Modules currently on the canvas (inventory). */
  canvasModules?: ReadonlyArray<PaletteCanvasModule>;
  /** Engines currently on the canvas (inventory). */
  canvasEngines?: ReadonlyArray<PaletteCanvasEngine>;
  /** Focus / select a canvas structure from inventory. */
  onFocusNode?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<StoreSection>('engines');
  const [view, setView] = useState<PanelView>('inventory');
  const [configuring, setConfiguring] = useState<EngineTemplate | null>(null);
  const [engineTemplates, setEngineTemplates] = useState<EngineTemplate[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(false);

  const canvasModules = props.canvasModules ?? [];
  const canvasEngines = props.canvasEngines ?? [];
  const engineOutline = useMemo(
    () => buildCanvasEngineOutline(canvasEngines),
    [canvasEngines],
  );
  const moduleOutline = useMemo(
    () =>
      buildCanvasModuleOutline(
        canvasModules,
        canvasEngines.map((engine) => ({ id: engine.id, label: engine.label })),
      ),
    [canvasModules, canvasEngines],
  );

  const enginesBySection = useMemo(() => {
    const grouped: Record<EngineCreateSection, EngineTemplate[]> = {
      research: [],
      execution: [],
      simulation: [],
    };
    for (const engine of engineTemplates) {
      grouped[engineCreateSection(engine)].push(engine);
    }
    return grouped;
  }, [engineTemplates]);

  function openSection(next: StoreSection) {
    setSection(next);
    setView('inventory');
    setConfiguring(null);
    setOpen(true);
  }

  function openStoreCatalog() {
    setConfiguring(null);
    setView('store');
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (configuring) {
        setConfiguring(null);
        return;
      }
      if (view === 'store') {
        setView('inventory');
        return;
      }
      setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, configuring, view]);

  useEffect(() => {
    if (!open || section !== 'engines' || view !== 'store') return;
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
  }, [open, section, view]);

  const sectionTabs: ReadonlyArray<{ id: StoreSection; label: string }> = [
    { id: 'engines', label: 'Engines' },
    { id: 'modules', label: 'Modules' },
  ];

  if (!open) {
    return (
      <div
        className="absolute left-4 top-4 z-20 flex border border-[var(--color-line)] bg-[var(--color-surface-1)]"
        role="group"
        aria-label="Canvas structures"
      >
        {sectionTabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => openSection(tab.id)}
            aria-label={`Open ${tab.label.toLowerCase()} on canvas`}
            className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] ${
              i > 0 ? 'border-l border-[var(--color-line)]' : ''
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <aside
      className="absolute left-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-72 flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface-1)]"
      aria-label={section === 'engines' ? 'Engines' : 'Modules'}
    >
      <div className="flex items-stretch border-b border-[var(--color-line)]">
        <div className="flex min-w-0 flex-1" role="tablist" aria-label="Structure kind">
          {sectionTabs.map((tab, i) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={section === tab.id}
              onClick={() => {
                setSection(tab.id);
                setView('inventory');
                setConfiguring(null);
              }}
              className={`min-w-0 flex-1 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
                i > 0 ? 'border-l border-[var(--color-line)]' : ''
              } ${
                section === tab.id
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="border-l border-[var(--color-line)] px-2.5 font-mono text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {view === 'inventory' && !configuring && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={openStoreCatalog}
              className="flex w-full items-center justify-between border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-dim)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              <span>Add new</span>
              <span className="text-[var(--color-ink-faint)]" aria-hidden>
                +
              </span>
            </button>

            {section === 'engines' && (
              <>
                <p className="px-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                  On canvas · {canvasEngines.length}
                </p>
                {canvasEngines.length === 0 ? (
                  <p className="px-0.5 text-[10px] text-[var(--color-ink-faint)]">
                    No engines yet. Add new to open the store.
                  </p>
                ) : (
                  <ul className="space-y-1" aria-label="Canvas engines outline">
                    {engineOutline.map((family) => (
                      <li key={family.root.id}>
                        <EngineInventoryRow
                          engine={family.root}
                          depth={0}
                          {...(props.onFocusNode ? { onFocus: props.onFocusNode } : {})}
                        />
                        {family.children.length > 0 ? (
                          <ul
                            className="mt-0.5 space-y-0.5 border-l border-[var(--color-line)] ml-2.5 pl-2"
                            aria-label={`Children of ${family.root.label}`}
                          >
                            {family.children.map((child) => (
                              <li key={child.id}>
                                <EngineInventoryRow
                                  engine={child}
                                  depth={1}
                                  {...(props.onFocusNode ? { onFocus: props.onFocusNode } : {})}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {section === 'modules' && (
              <>
                <p className="px-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                  On canvas · {canvasModules.length}
                </p>
                {canvasModules.length === 0 ? (
                  <p className="px-0.5 text-[10px] text-[var(--color-ink-faint)]">
                    No modules yet. Add new to open the store.
                  </p>
                ) : (
                  <ul className="space-y-1" aria-label="Canvas modules by engine">
                    {moduleOutline.map((group) => (
                      <li key={group.engineId ?? 'company'}>
                        <div
                          className="flex items-center gap-2 px-2 py-1"
                          data-testid="module-inventory-engine"
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-dim)]">
                            {group.engineLabel}
                          </span>
                          <span className="shrink-0 font-mono text-[8px] text-[var(--color-ink-faint)]">
                            {group.modules.length}
                          </span>
                        </div>
                        <ul
                          className="mt-0.5 space-y-0.5 border-l border-[var(--color-line)] ml-2.5 pl-2"
                          aria-label={`Modules in ${group.engineLabel}`}
                        >
                          {group.modules.map((mod) => {
                            const visual = MODULE_VISUALS[mod.type as ModuleType];
                            return (
                              <li key={mod.id}>
                                <button
                                  type="button"
                                  onClick={() => props.onFocusNode?.(mod.id)}
                                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
                                  data-testid="module-inventory-child"
                                >
                                  <span
                                    className="shrink-0 font-mono text-[10px] text-[var(--color-ink-faint)]"
                                    aria-hidden
                                  >
                                    └
                                  </span>
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{
                                      background: visual?.hue ?? 'var(--color-ink-faint)',
                                    }}
                                    aria-hidden
                                  />
                                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-ink)]">
                                    {mod.name}
                                  </span>
                                  <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                                    {visual?.label ?? mod.type}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {view === 'store' && section === 'modules' && (
          <div>
            <button
              type="button"
              onClick={() => setView('inventory')}
              className="mb-2 px-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              ← On canvas
            </button>
            {CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-2">
                <div className="px-2 pb-1 pt-1.5 font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                  {cat.label}
                </div>
                {cat.types.map((type) => {
                  const entry = ADDABLE.find((a) => a.type === type);
                  if (!entry) return null;
                  const visual = MODULE_VISUALS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        props.onAdd(
                          type,
                          moduleFunctionLabel(type, entry.defaultConfig),
                          entry.defaultConfig,
                        )
                      }
                      className="group flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
                    >
                      <span className="flex items-center gap-2 text-sm text-[var(--color-ink-dim)] group-hover:text-[var(--color-ink)]">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: visual.hue }}
                        />
                        <span className="min-w-0 truncate">{visual.label}</span>
                        <span
                          className="ml-auto shrink-0 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider"
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
          </div>
        )}

        {view === 'store' && section === 'engines' && !configuring && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setView('inventory')}
              className="px-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              ← On canvas
            </button>
            <p className="px-0.5 text-[10px] leading-snug text-[var(--color-ink-faint)]">
              Insertable engine templates. Research packs vs execution desks.
            </p>
            {enginesLoading && (
              <p className="px-0.5 py-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
                Loading catalog…
              </p>
            )}
            {!enginesLoading && engineTemplates.length === 0 && (
              <p className="px-0.5 py-2 text-[10px] text-[var(--color-warn)]">
                No engine templates available.
              </p>
            )}
            {!enginesLoading &&
              ENGINE_STORE_SECTIONS.map((group) => {
                const engines = enginesBySection[group.id];
                if (engines.length === 0) return null;
                return (
                  <div key={group.id} className="mb-1">
                    <div className="px-2 pb-1 pt-1.5 font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                      {group.label}
                    </div>
                    <p className="px-2 pb-1.5 text-[9px] leading-snug text-[var(--color-ink-faint)]">
                      {group.hint}
                    </p>
                    <div className="space-y-1">
                      {engines.map((engine) => (
                        <button
                          key={engine.id}
                          type="button"
                          disabled={!engine.available}
                          onClick={() => setConfiguring(engine)}
                          className="w-full border border-[var(--color-line)] px-2.5 py-2 text-left hover:border-[var(--color-ink-faint)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm text-[var(--color-ink)]">
                              {engine.label}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <span className="border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-dim)]">
                                {group.id === 'execution'
                                  ? 'Exec'
                                  : group.id === 'simulation'
                                    ? 'Sim'
                                    : 'Research'}
                              </span>
                              {!engine.available && (
                                <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--color-warn)]">
                                  soon
                                </span>
                              )}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-faint)]">
                            {engine.available ? engine.description : engine.unavailableReason}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {section === 'engines' && configuring && (
          <EngineConfigForm
            engine={configuring}
            {...(props.companyDefaults ? { companyDefaults: props.companyDefaults } : {})}
            executionEngines={props.executionEngines ?? []}
            onCancel={() => setConfiguring(null)}
            onInsert={async (inputs, setup, options) => {
              await props.onInsertEngine(configuring, inputs, setup, options);
              setConfiguring(null);
              setView('inventory');
              setOpen(false);
            }}
          />
        )}
      </div>
    </aside>
  );
}

function engineCreateSectionLabel(templateId: string): string {
  const template = getEngineTemplateById(templateId);
  if (!template) return 'Engine';
  const section = engineCreateSection(template);
  if (section === 'execution') return 'Exec';
  if (section === 'simulation') return 'Sim';
  return 'Research';
}

function engineChildBadge(engine: PaletteCanvasEngine): string {
  if (engine.childKind === 'research') return 'Research';
  if (engine.childKind === 'simulation') {
    if (engine.simRole === 'gate') return 'Sim · gate';
    if (engine.simRole === 'training') return 'Sim · train';
    if (engine.simRole === 'adhoc') return 'Sim · adhoc';
    return 'Sim';
  }
  return engineCreateSectionLabel(engine.templateId);
}

function EngineInventoryRow(props: {
  engine: PaletteCanvasEngine;
  depth: number;
  onFocus?: (id: string) => void;
}) {
  const { engine, depth, onFocus } = props;
  return (
    <button
      type="button"
      onClick={() => onFocus?.(engine.id)}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
      data-testid={depth > 0 ? 'engine-inventory-child' : 'engine-inventory-root'}
      data-depth={depth}
    >
      {depth > 0 ? (
        <span
          className="shrink-0 font-mono text-[10px] text-[var(--color-ink-faint)]"
          aria-hidden
        >
          └
        </span>
      ) : (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-ink)]">
        {engine.label}
      </span>
      <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        {engineChildBadge(engine)}
      </span>
    </button>
  );
}

/** Collects the engine's required user inputs before insertion. */
function EngineConfigForm(props: {
  engine: EngineTemplate;
  companyDefaults?: CompanyEngineDefaults;
  executionEngines?: ReadonlyArray<{ id: string; label: string }>;
  onCancel: () => void;
  onInsert: (
    inputs: Record<string, string>,
    setup?: ModuleSetupInput,
    options?: {
      cascadeFromCompany?: boolean;
      simulationBinding?: SimulationEngineBinding;
      /** D-189: child sim count when inserting execution (default 2). */
      simCount?: number;
      researchLibraryBinding?: ResearchLibraryBinding;
    },
  ) => Promise<void>;
}) {
  const isSimulation = engineCreateSection(props.engine) === 'simulation';
  const isExecution = engineCreateSection(props.engine) === 'execution';
  const isResearch = engineCreateSection(props.engine) === 'research';
  const isAdhocTemplate = props.engine.id === 'sim_adhoc_paper_desk';
  const [simCountPerExecution, setSimCountPerExecution] = useState(DEFAULT_EXECUTION_SIM_COUNT);
  const [cascadeFromCompany, setCascadeFromCompany] = useState(true);
  const [linkMode, setLinkMode] = useState<'adhoc' | 'linked'>(
    isAdhocTemplate || !isSimulation ? 'adhoc' : 'linked',
  );
  const [researchBindingMode, setResearchBindingMode] = useState<
    'create_internal' | 'attach_execution'
  >(() => ((props.executionEngines?.length ?? 0) > 0 ? 'attach_execution' : 'create_internal'));
  const [parentExecutionId, setParentExecutionId] = useState(
    () => props.executionEngines?.[0]?.id ?? '',
  );
  const [placement, setPlacement] = useState<SimulationPlacement>(() =>
    props.engine.id === 'sim_train_policy_replay' ? 'post' : 'pre',
  );
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
      let simulationBinding: SimulationEngineBinding | undefined;
      let researchLibraryBinding: ResearchLibraryBinding | undefined;
      if (isSimulation) {
        if (linkMode === 'linked') {
          if (!parentExecutionId) {
            setError('Select a parent execution engine for linked sims.');
            setBusy(false);
            return;
          }
          simulationBinding = {
            role: simulationRoleForPlacement(placement),
            placement,
            parentExecutionEngineId: parentExecutionId,
            mimicParent: true,
          };
        } else {
          simulationBinding = { role: 'adhoc', mimicParent: false };
        }
      }
      if (isResearch) {
        if (researchBindingMode === 'attach_execution') {
          if (!parentExecutionId) {
            setError('Select a parent execution engine to hydrate its Data Hub.');
            setBusy(false);
            return;
          }
          researchLibraryBinding = {
            mode: 'attach_execution',
            engineInstanceId: parentExecutionId,
          };
        } else {
          researchLibraryBinding = { mode: 'create_internal' };
        }
      }
      await props.onInsert(
        values,
        skipSetup ? undefined : moduleSetupInputFromDraft(setupDraft, requiredSetupFields),
        {
          cascadeFromCompany,
          ...(simulationBinding ? { simulationBinding } : {}),
          ...(isExecution ? { simCount: simCountPerExecution } : {}),
          ...(researchLibraryBinding ? { researchLibraryBinding } : {}),
        },
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
      {isExecution && (
        <label className="flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-[10px] text-[var(--color-ink-dim)]">
          Child sims
          <select
            className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-1 py-0.5 text-[10px] text-[var(--color-ink)]"
            value={simCountPerExecution}
            onChange={(event) =>
              setSimCountPerExecution(Number.parseInt(event.target.value, 10) || 0)
            }
            data-testid="palette-sim-count-per-execution"
          >
            {[0, 1, 2, 3, 4].map((count) => (
              <option key={count} value={count}>
                {count === 0 ? 'none' : count}
              </option>
            ))}
          </select>
          <span className="text-[var(--color-ink-faint)]">(gate pre + train post by default)</span>
        </label>
      )}
      {isResearch && (props.executionEngines?.length ?? 0) > 0 && (
        <div className="space-y-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-dim)]">
            Library binding (D-184)
          </p>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="research-binding-mode"
                checked={researchBindingMode === 'create_internal'}
                onChange={() => setResearchBindingMode('create_internal')}
              />
              New internal library
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="research-binding-mode"
                checked={researchBindingMode === 'attach_execution'}
                onChange={() => setResearchBindingMode('attach_execution')}
              />
              Attach to execution hub
            </label>
          </div>
          {researchBindingMode === 'attach_execution' && (
            <label className="block space-y-1">
              <span className="text-[10px] text-[var(--color-ink-dim)]">Parent execution</span>
              <select
                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1 text-xs"
                value={parentExecutionId}
                onChange={(event) => setParentExecutionId(event.target.value)}
              >
                {(props.executionEngines ?? []).map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {isSimulation && (
        <div className="space-y-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-dim)]">
            Placement (D-189)
          </p>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="sim-link-mode"
                checked={linkMode === 'adhoc'}
                onChange={() => setLinkMode('adhoc')}
              />
              Adhoc (standalone)
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="sim-link-mode"
                checked={linkMode === 'linked'}
                onChange={() => setLinkMode('linked')}
                disabled={(props.executionEngines?.length ?? 0) === 0}
              />
              Link to execution
            </label>
          </div>
          {linkMode === 'linked' && (
            <div className="space-y-1.5">
              <label className="block space-y-1">
                <span className="text-[10px] text-[var(--color-ink-dim)]">Parent execution</span>
                <select
                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1 text-xs"
                  value={parentExecutionId}
                  onChange={(event) => setParentExecutionId(event.target.value)}
                >
                  {(props.executionEngines ?? []).map((engine) => (
                    <option key={engine.id} value={engine.id}>
                      {engine.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] text-[var(--color-ink-dim)]">
                  Process placement
                </span>
                <select
                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1 text-xs"
                  value={placement}
                  onChange={(event) =>
                    setPlacement(event.target.value as SimulationPlacement)
                  }
                >
                  <option value="pre">Pre / parallel (gate)</option>
                  <option value="post">Post (training)</option>
                </select>
              </label>
            </div>
          )}
        </div>
      )}
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
