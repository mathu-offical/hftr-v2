'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ENGINE_TEMPLATES,
  MAX_ENGINES_PER_COMPANY,
  MAX_MODULES_PER_COMPANY,
  SECTOR_FOCUS_GROUP_DEFS,
  defaultEngineCapitalEnvelope,
  defaultTargetExitLocal,
  engineCreateSection,
  expandSectorGroupsToFocuses,
  groupLabel,
  listEngineTemplatesForCreateSection,
  projectedModuleSlotsForCreate,
  researchDependenciesForExecutionEngine,
  simDependenciesForExecutionEngine,
  DEFAULT_EXECUTION_SIM_COUNT,
  requiredModuleSetupFields,
  sectorFocusDraftString,
  type EngineCreateSection,
  type EngineTemplate,
  type ModuleSetupField,
  type ModuleType,
  type SectorFocusGroupId,
  type SimulationPlacement,
} from '@hftr/contracts';
import { EngineCanvasPreview } from '@/components/canvas/EngineCanvasPreview';
import {
  EMPTY_MODULE_SETUP_DRAFT,
  ModuleSetupFields,
  missingFieldsFromDraft,
  moduleSetupInputFromDraft,
  type ModuleSetupDraft,
} from '@/components/canvas/ModuleSetupFields';
import { api, RequestError } from '@/lib/client';
import { buildEngineSeedHierarchy } from '@/lib/build-template-preview-graph';

function seedCentsFromDollars(seedDollars: string): number {
  return Math.max(0, Math.round(Number(seedDollars) || 0) * 100);
}

function defaultEngineDraft(seedCreditsCents: number): ModuleSetupDraft {
  const envelope = defaultEngineCapitalEnvelope(seedCreditsCents);
  return {
    ...EMPTY_MODULE_SETUP_DRAFT,
    allocationMode: envelope.mode,
    allocationValue: envelope.value,
    targetExitLocal: defaultTargetExitLocal(),
  };
}

function defaultStandaloneModuleDraft(
  type: ModuleType,
  seedCreditsCents: number,
): ModuleSetupDraft {
  const required = new Set(requiredModuleSetupFields(type));
  if (required.size === 0) return { ...EMPTY_MODULE_SETUP_DRAFT };
  const envelope = defaultEngineCapitalEnvelope(seedCreditsCents);
  return {
    ...EMPTY_MODULE_SETUP_DRAFT,
    allocationMode: envelope.mode,
    allocationValue: required.has('capital_allocation') ? envelope.value : '',
    targetExitLocal: required.has('target_exit') ? defaultTargetExitLocal() : '',
  };
}

function requiredSetupForEngine(templateId: string): ModuleSetupField[] {
  return [
    ...new Set(
      ENGINE_TEMPLATES.find((engine) => engine.id === templateId)?.modules.flatMap((module) =>
        requiredModuleSetupFields(module.type),
      ) ?? [],
    ),
  ] as ModuleSetupField[];
}

function defaultEngineInputs(templateId: string): Record<string, string> {
  const engine = ENGINE_TEMPLATES.find((item) => item.id === templateId);
  if (!engine) return {};
  return Object.fromEntries(engine.inputs.map((input) => [input.key, input.options?.[0] ?? '']));
}

type EngineSeed = {
  key: string;
  templateId: string;
  label: string;
  description: string;
  inputs: Record<string, string>;
  draft: ModuleSetupDraft;
  /** True when auto-added as a research/sim dependency of an execution engine. */
  autoDependency?: boolean;
  /** Execution seed key that caused this research/sim dep (live cascade source). */
  cascadedFromKey?: string;
  /** D-189: linked simulation placement (pre=gate, post=training). */
  simulationPlacement?: SimulationPlacement;
  simulationRole?: 'gate' | 'training' | 'adhoc';
};

type ModuleSeed = {
  key: string;
  type: ModuleType;
  name: string;
  draft: ModuleSetupDraft;
};

const ADDABLE_MODULES: Array<{
  type: ModuleType;
  defaultName: string;
  defaultConfig: unknown;
  hint: string;
}> = [
  {
    type: 'research',
    defaultName: 'Market Research',
    defaultConfig: { topicScope: 'pending_operator_scope', curiosity: 'balanced' },
    hint: 'Explores topics, feeds libraries',
  },
  {
    type: 'librarian',
    defaultName: 'Library Librarian',
    defaultConfig: { topicScope: 'pending_operator_scope' },
    hint: 'Queries libraries, relevance, topic hygiene',
  },
  {
    type: 'library',
    defaultName: 'Research Evidence Library',
    defaultConfig: { topicScope: 'pending_operator_scope', masterLibrary: false },
    hint: 'Curated knowledge store',
  },
  {
    type: 'live_api',
    defaultName: 'Paper Market Data Feed',
    defaultConfig: {
      venue: 'paper_sim',
      instruments: [],
      feedClass: 'synthetic_sim',
      pollSeconds: 60,
    },
    hint: 'Market data feed',
  },
  {
    type: 'trend',
    defaultName: 'Market Trend Scanner',
    defaultConfig: { focus: 'pending_operator_scope', maxActiveTrends: 10, cadenceMinutes: 30 },
    hint: 'Finds tradeable trends',
  },
  {
    type: 'trading',
    defaultName: 'Paper Trading Desk',
    defaultConfig: { subtype: 'day', strategyFamilies: [], exitTimelineDays: 1, cadenceMinutes: 5 },
    hint: 'Executes a strategy pipeline',
  },
  {
    type: 'holding_fund',
    defaultName: 'Company Holding Fund',
    defaultConfig: { source: 'company_seed', allocationPolicyRef: 'paper_balanced_general_v1' },
    hint: 'Deterministic capital source',
  },
  {
    type: 'fund_router',
    defaultName: 'Deterministic Fund Router',
    defaultConfig: {
      policyEnvelopeRef: 'paper_balanced_general_v1',
      approvalMode: 'manual',
      targetModuleIds: [],
    },
    hint: 'Moves allocations under policy',
  },
  {
    type: 'policy',
    defaultName: 'Paper Trading Policy',
    defaultConfig: { policyEnvelopeRef: 'paper_balanced_general_v1', notes: '' },
    hint: 'Binds risk/goal envelopes',
  },
  {
    type: 'analyzer',
    defaultName: 'Execution Outcome Analyzer',
    defaultConfig: {},
    hint: 'Reviews outcomes',
  },
  {
    type: 'display',
    defaultName: 'Operations Table',
    defaultConfig: { displayKind: 'table', title: 'Operations Table' },
    hint: 'Graphs, lists, tables, ledgers',
  },
];

/**
 * Company creation (D-043): name + philosophy + paper seed, then compose ≥1 ENGINE
 * via Research / Execution add buttons. Execution engines auto-add research
 * dependency packs. Optional standalone modules.
 */
export function CreateCompanyForm() {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [philosophy, setPhilosophy] = useState('');
  const [sectorGroups, setSectorGroups] = useState<SectorFocusGroupId[]>([]);
  const sectorFocuses = expandSectorGroupsToFocuses(sectorGroups);
  const [seedDollars, setSeedDollars] = useState('10000');
  const [engines, setEngines] = useState<EngineSeed[]>([]);
  const [extraModules, setExtraModules] = useState<ModuleSeed[]>([]);
  const [selectedEngineKey, setSelectedEngineKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Expanded until name + philosophy are confirmed; Edit re-opens. */
  const [identityExpanded, setIdentityExpanded] = useState(true);
  /** D-189: default child sims per execution add (0 = none). */
  const [simCountPerExecution, setSimCountPerExecution] = useState(DEFAULT_EXECUTION_SIM_COUNT);

  const availableEngines = ENGINE_TEMPLATES.filter((engine) => engine.available);
  // Include gated templates so Research/Execution show locked add buttons with reasons.
  const researchCatalog = listEngineTemplatesForCreateSection('research');
  const executionCatalog = listEngineTemplatesForCreateSection('execution');
  const simulationCatalog = listEngineTemplatesForCreateSection('simulation');
  const atEngineLimit = engines.length >= MAX_ENGINES_PER_COMPANY;
  const selectedEngine = engines.find((item) => item.key === selectedEngineKey) ?? null;
  const previewEngines = engines.map((item) => ({
    ...item,
    label: engineInstanceLabel(engines, item),
  }));
  const seedHierarchy = buildEngineSeedHierarchy(previewEngines);

  function makeEngineSeed(
    templateId: string,
    seedCreditsCents: number,
    options?: {
      autoDependency?: boolean;
      cascadedFromKey?: string;
      key?: string;
      draft?: ModuleSetupDraft;
      simulationPlacement?: SimulationPlacement;
      simulationRole?: 'gate' | 'training' | 'adhoc';
    },
  ): EngineSeed | null {
    const engine = availableEngines.find((item) => item.id === templateId);
    if (!engine) return null;
    const seededDraft =
      options?.draft ??
      ({
        ...defaultEngineDraft(seedCreditsCents),
        topicSectors: sectorFocusDraftString(sectorFocuses),
      } satisfies ModuleSetupDraft);
    const seed: EngineSeed = {
      key: options?.key ?? `${formId}-eng-${crypto.randomUUID()}`,
      templateId: engine.id,
      label: engine.label,
      description: engine.description,
      inputs: defaultEngineInputs(engine.id),
      draft: seededDraft,
    };
    if (options?.autoDependency) {
      seed.autoDependency = true;
    }
    if (options?.cascadedFromKey) {
      seed.cascadedFromKey = options.cascadedFromKey;
    }
    if (options?.simulationPlacement) {
      seed.simulationPlacement = options.simulationPlacement;
    }
    if (options?.simulationRole) {
      seed.simulationRole = options.simulationRole;
    }
    return seed;
  }

  function applySectorFocusesToEngines(nextFocuses: string[]) {
    const topic = sectorFocusDraftString(nextFocuses);
    setEngines((prev) =>
      prev.map((item) => ({
        ...item,
        draft: { ...item.draft, topicSectors: topic },
      })),
    );
    setExtraModules((prev) =>
      prev.map((item) => {
        const required = requiredModuleSetupFields(item.type);
        if (!required.includes('topic_sector')) return item;
        return { ...item, draft: { ...item.draft, topicSectors: topic } };
      }),
    );
  }

  function toggleSectorGroup(groupId: SectorFocusGroupId) {
    const next = sectorGroups.includes(groupId)
      ? sectorGroups.filter((id) => id !== groupId)
      : [...sectorGroups, groupId];
    setSectorGroups(next);
    applySectorFocusesToEngines(expandSectorGroupsToFocuses(next));
  }

  function cascadeDraftToDeps(
    enginesList: EngineSeed[],
    executionKey: string,
    draft: ModuleSetupDraft,
  ): EngineSeed[] {
    return enginesList.map((item) => {
      if (item.cascadedFromKey !== executionKey || !item.autoDependency) return item;
      return {
        ...item,
        draft: {
          ...item.draft,
          topicSectors: draft.topicSectors,
          allocationMode: draft.allocationMode,
          allocationValue: draft.allocationValue,
          targetExitLocal: draft.targetExitLocal,
        },
      };
    });
  }

  function addResearchEngine(templateId: string) {
    if (atEngineLimit) {
      setError(`Engine limit reached (${MAX_ENGINES_PER_COMPANY}). Remove one to add another.`);
      return;
    }
    const seed = makeEngineSeed(templateId, seedCentsFromDollars(seedDollars));
    if (!seed) return;
    setError(null);
    setEngines((prev) => [...prev, seed]);
    setSelectedEngineKey(seed.key);
  }

  function addExecutionEngine(templateId: string) {
    const depIds = researchDependenciesForExecutionEngine(templateId).filter((depId) =>
      availableEngines.some((engine) => engine.id === depId),
    );
    const simDeps = simDependenciesForExecutionEngine(templateId, simCountPerExecution).filter(
      (dep) => availableEngines.some((engine) => engine.id === dep.templateId),
    );
    const slotsNeeded = 1 + depIds.length + simDeps.length;
    if (engines.length + slotsNeeded > MAX_ENGINES_PER_COMPANY) {
      setError(
        `Need ${slotsNeeded} free engine slots (execution + research + sims). Remove engines first.`,
      );
      return;
    }
    const cents = seedCentsFromDollars(seedDollars);
    const execKey = `${formId}-eng-${crypto.randomUUID()}`;
    const execSeed = makeEngineSeed(templateId, cents, { key: execKey });
    if (!execSeed) return;

    setError(null);
    setEngines((prev) => {
      const next = [...prev];
      for (const depId of depIds) {
        const dep = makeEngineSeed(depId, cents, {
          autoDependency: true,
          cascadedFromKey: execKey,
          draft: { ...execSeed.draft },
        });
        if (!dep) continue;
        next.push(dep);
      }
      next.push(execSeed);
      for (const simDep of simDeps) {
        const role = simDep.placement === 'pre' ? 'gate' : 'training';
        const sim = makeEngineSeed(simDep.templateId, cents, {
          autoDependency: true,
          cascadedFromKey: execKey,
          draft: { ...execSeed.draft },
          simulationPlacement: simDep.placement,
          simulationRole: role,
        });
        if (!sim) continue;
        next.push(sim);
      }
      return next;
    });
    setSelectedEngineKey(execKey);
  }

  function addSimulationEngine(templateId: string) {
    if (atEngineLimit) {
      setError(`Engine limit reached (${MAX_ENGINES_PER_COMPANY}). Remove one to add another.`);
      return;
    }
    const seed = makeEngineSeed(templateId, seedCentsFromDollars(seedDollars), {
      simulationRole: 'adhoc',
    });
    if (!seed) return;
    setError(null);
    setEngines((prev) => [...prev, seed]);
    setSelectedEngineKey(seed.key);
  }

  function removeEngine(key: string) {
    const target = engines.find((item) => item.key === key);
    if (!target) return;
    const template = ENGINE_TEMPLATES.find((entry) => entry.id === target.templateId);
    const isExecution = template ? engineCreateSection(template) === 'execution' : false;
    const next = engines.filter((item) => {
      if (item.key === key) return false;
      if (isExecution && item.cascadedFromKey === key) return false;
      return true;
    });
    setEngines(next);
    setSelectedEngineKey((current) => {
      if (current && next.some((item) => item.key === current)) return current;
      return next[0]?.key ?? null;
    });
  }

  function updateEngine(key: string, patch: Partial<EngineSeed>) {
    setEngines((prev) => {
      let next = prev.map((item) => (item.key === key ? { ...item, ...patch } : item));
      const updated = next.find((item) => item.key === key);
      if (!updated || !patch.draft) return next;
      const template = ENGINE_TEMPLATES.find((entry) => entry.id === updated.templateId);
      if (template && engineCreateSection(template) === 'execution') {
        next = cascadeDraftToDeps(next, key, updated.draft);
      }
      return next;
    });
  }

  function addModule(type: ModuleType) {
    const entry = ADDABLE_MODULES.find((item) => item.type === type);
    if (!entry) return;
    const draft = defaultStandaloneModuleDraft(entry.type, seedCentsFromDollars(seedDollars));
    if (requiredModuleSetupFields(entry.type).includes('topic_sector')) {
      draft.topicSectors = sectorFocusDraftString(sectorFocuses);
    }
    setExtraModules((prev) => [
      ...prev,
      {
        key: `${formId}-mod-${crypto.randomUUID()}`,
        type: entry.type,
        name: entry.defaultName,
        draft,
      },
    ]);
  }

  function removeModule(key: string) {
    setExtraModules((prev) => prev.filter((item) => item.key !== key));
  }

  function updateModule(key: string, patch: Partial<ModuleSeed>) {
    setExtraModules((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function refreshSeedDefaults(nextSeedDollars: string) {
    const cents = seedCentsFromDollars(nextSeedDollars);
    setEngines((prev) =>
      prev.map((item) => ({
        ...item,
        draft: {
          ...defaultEngineDraft(cents),
          topicSectors: item.draft.topicSectors,
        },
      })),
    );
    setExtraModules((prev) =>
      prev.map((item) => {
        const refreshed = defaultStandaloneModuleDraft(item.type, cents);
        return {
          ...item,
          draft: {
            ...refreshed,
            topicSectors: item.draft.topicSectors,
          },
        };
      }),
    );
  }

  const enginesMissing = engines.flatMap((item) => {
    const required = requiredSetupForEngine(item.templateId);
    const setupMissing = missingFieldsFromDraft(required, item.draft).map(
      (field) => `${item.key}:${field}`,
    );
    const engine = ENGINE_TEMPLATES.find((entry) => entry.id === item.templateId);
    const inputMissing =
      engine?.inputs
        .filter((input) => input.key !== 'focus' && input.key !== 'topicScope')
        .filter((input) => !item.inputs[input.key]?.trim())
        .map((input) => `${item.key}:input:${input.key}`) ?? [];
    return [...setupMissing, ...inputMissing];
  });
  const modulesMissing = extraModules.flatMap((item) => {
    const required = requiredModuleSetupFields(item.type) as ModuleSetupField[];
    return missingFieldsFromDraft(required, item.draft).map((field) => `${item.key}:${field}`);
  });
  const hasBlockingMissing = enginesMissing.length + modulesMissing.length > 0;
  const engineInputsMissing = engines.flatMap((item) => {
    const engine = ENGINE_TEMPLATES.find((entry) => entry.id === item.templateId);
    return (
      engine?.inputs
        .filter((input) => input.key !== 'focus' && input.key !== 'topicScope')
        .filter((input) => !item.inputs[input.key]?.trim())
        .map((input) => `${item.key}:input:${input.key}`) ?? []
    );
  });
  const hasIdentity = name.trim().length >= 1 && philosophy.trim().length >= 1;
  const showIdentityFields = identityExpanded || !hasIdentity;

  const canCreate = engines.length >= 1 && hasIdentity && !busy;
  const canSubmitSetup = canCreate && !hasBlockingMissing;
  // Skip may omit topic/capital/exit but still needs name, philosophy, and
  // template inputs (module-store parity). type=button skip must not bypass
  // HTML required — gate here so empty philosophy never hits the API.
  const canSkip = canCreate && engineInputsMissing.length === 0;

  async function createCompany(skipSetup: boolean) {
    if (engines.length < 1) {
      setError('Add at least one engine to create this company.');
      return;
    }
    const projectedSlots = projectedModuleSlotsForCreate({
      engineModuleTypes: engines.map((item) => {
        const template = ENGINE_TEMPLATES.find((entry) => entry.id === item.templateId);
        return (template?.modules ?? []).map((module) => module.type);
      }),
      extraModuleTypes: extraModules.map((item) => item.type),
    });
    if (projectedSlots > MAX_MODULES_PER_COMPANY) {
      setError(
        `This setup needs ${projectedSlots} modules (limit ${MAX_MODULES_PER_COMPANY}). Remove an engine or standalone module.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const seed = seedCentsFromDollars(seedDollars);
      const enginesPayload = engines.map((item) => {
        const required = requiredSetupForEngine(item.templateId);
        return {
          templateId: item.templateId,
          inputs: item.inputs,
          setup: skipSetup ? undefined : moduleSetupInputFromDraft(item.draft, required),
          ...(item.simulationPlacement
            ? { simulationPlacement: item.simulationPlacement }
            : {}),
          ...(item.simulationRole ? { simulationRole: item.simulationRole } : {}),
        };
      });

      const modulesPayload = extraModules.map((item) => {
        const catalog = ADDABLE_MODULES.find((entry) => entry.type === item.type);
        const required = requiredModuleSetupFields(item.type) as ModuleSetupField[];
        return {
          type: item.type,
          name: item.name,
          config: catalog?.defaultConfig ?? {},
          setup: skipSetup ? undefined : moduleSetupInputFromDraft(item.draft, required),
        };
      });

      const { company } = await api<{ company: { id: string } }>('/api/companies', {
        method: 'POST',
        body: {
          name,
          philosophyPrompt: philosophy,
          mode: 'paper',
          seedCreditsCents: seed,
          sectorFocuses,
          engines: enginesPayload,
          extraModules: modulesPayload.length > 0 ? modulesPayload : undefined,
        },
      });
      setOpen(false);
      router.push(`/companies/${company.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestError ? humanize(err) : 'Something went wrong.');
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      // Store popovers handle Escape first (capture); skip dialog dismiss then.
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && !busy) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, busy]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        New company
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/60 p-3 sm:p-4 md:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-create-title`}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void createCompany(false);
            }}
            className="flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] shadow-2xl"
            data-testid="create-company-dialog"
          >
            <header className="shrink-0 border-b border-[var(--color-line)] px-4 py-2.5">
              <h2 id={`${formId}-create-title`} className="text-base font-medium">
                New company
              </h2>
              <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                ≥1 engine required. Execution add auto-seeds research deps + default sim children
                (count below). Adhoc sims via Simulation.
              </p>
            </header>

            {/* Viewport-bounded body: no outer page scroll; each region scrolls itself. */}
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 sm:p-4">
              <div
                className="shrink-0"
                data-testid="create-identity"
                data-identity-condensed={showIdentityFields ? 'false' : 'true'}
              >
                {showIdentityFields ? (
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-end">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs leading-4 text-[var(--color-ink-dim)]">
                        {name.trim() ? 'Name' : 'Required · Name'}
                      </span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={80}
                        placeholder="e.g. Momentum Desk"
                        className="h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs leading-4 text-[var(--color-ink-dim)]">
                        Paper seed (USD)
                      </span>
                      <input
                        value={seedDollars}
                        onChange={(e) => {
                          const next = e.target.value;
                          setSeedDollars(next);
                          refreshSeedDefaults(next);
                        }}
                        inputMode="numeric"
                        className="h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] sm:items-start">
                      <label className="flex min-w-0 flex-col gap-1">
                        <span className="text-xs leading-4 text-[var(--color-ink-dim)]">
                          {philosophy.trim() ? 'Philosophy' : 'Required · Philosophy'}
                        </span>
                        <textarea
                          value={philosophy}
                          onChange={(e) => setPhilosophy(e.target.value)}
                          required
                          rows={2}
                          maxLength={4000}
                          placeholder="Patient swing trading on large-cap tech. Prefer strong evidence over speed; cut losers fast."
                          className="min-h-[3.25rem] w-full resize-y rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                        />
                      </label>
                      <SectorGroupPicker selected={sectorGroups} onToggle={toggleSectorGroup} />
                    </div>
                    <div className="flex justify-end sm:col-span-2">
                      <button
                        type="button"
                        disabled={!hasIdentity}
                        onClick={() => setIdentityExpanded(false)}
                        aria-label="Confirm identity"
                        data-testid="create-identity-confirm"
                        className="h-8 shrink-0 rounded-md border border-[var(--color-accent)] px-3 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIdentityExpanded(true)}
                    className="flex w-full items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2.5 py-1.5 text-left hover:border-[var(--color-accent)]/50"
                    aria-label="Edit company identity"
                    data-testid="create-identity-summary"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--color-ink)]">
                      {name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-dim)]">
                      ${seedDollars || '0'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--color-ink-faint)]">
                      {philosophy}
                    </span>
                    {sectorGroups.length > 0 && (
                      <span className="max-w-[10rem] shrink-0 truncate text-[10px] text-[var(--color-accent)]">
                        {sectorGroups.length === 1
                          ? groupLabel(sectorGroups[0]!)
                          : `${groupLabel(sectorGroups[0]!)} +${sectorGroups.length - 1}`}
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] text-[var(--color-accent)]">Edit</span>
                  </button>
                )}
              </div>

              <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] p-2">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="text-xs font-medium text-[var(--color-ink)]">Engines</h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <EngineStoreMenu
                        title="Research"
                        description="Specialty packs"
                        catalog={researchCatalog}
                        addDisabled={atEngineLimit}
                        onAdd={addResearchEngine}
                        testId="engine-section-research"
                      />
                      <EngineStoreMenu
                        title="Execution"
                        description="Full-spine · cascades research + sims"
                        catalog={executionCatalog}
                        addDisabled={atEngineLimit}
                        onAdd={addExecutionEngine}
                        testId="engine-section-execution"
                      />
                      <EngineStoreMenu
                        title="Simulation"
                        description="Paper gate / train / adhoc desks"
                        catalog={simulationCatalog}
                        addDisabled={atEngineLimit}
                        onAdd={addSimulationEngine}
                        testId="engine-section-simulation"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-ink-dim)]">
                      Sims / exec
                      <select
                        className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-1 py-0.5 text-[10px] text-[var(--color-ink)]"
                        value={simCountPerExecution}
                        onChange={(event) =>
                          setSimCountPerExecution(Number.parseInt(event.target.value, 10) || 0)
                        }
                        data-testid="sim-count-per-execution"
                      >
                        {[0, 1, 2, 3, 4].map((count) => (
                          <option key={count} value={count}>
                            {count === 0 ? 'none' : count}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {engines.length === 0 && (
                    <p
                      className="text-[10px] text-[var(--color-warn)]"
                      data-testid="engines-empty-hint"
                    >
                      Add at least one engine
                    </p>
                  )}
                </div>

                <div
                  className="grid min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] max-lg:grid-rows-[minmax(0,8.5rem)_minmax(0,1fr)_minmax(0,11rem)] lg:grid-cols-[11rem_minmax(0,1fr)_18rem]"
                  data-testid="engine-workspace"
                >
                  <aside
                    className="flex min-h-0 flex-col overflow-hidden border-b border-[var(--color-line)] lg:border-b-0 lg:border-r"
                    data-testid="engine-seed-list"
                  >
                    <div className="shrink-0 border-b border-[var(--color-line)] px-2 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-dim)]">
                        Added
                      </p>
                      <p className="text-[9px] text-[var(--color-ink-faint)]">
                        Nested deps · select · remove
                      </p>
                    </div>
                    <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-1.5">
                      {engines.length === 0 ? (
                        <li className="px-1 py-2 text-[10px] text-[var(--color-ink-faint)]">
                          No engines yet
                        </li>
                      ) : (
                        <>
                          {seedHierarchy.families.map((family) => {
                            const root = engines.find((item) => item.key === family.root.key);
                            if (!root) return null;
                            return (
                              <li key={family.root.key} className="space-y-1">
                                <EngineNavRow
                                  item={root}
                                  engines={engines}
                                  selected={selectedEngineKey === root.key}
                                  depth={0}
                                  onSelect={setSelectedEngineKey}
                                  onRemove={removeEngine}
                                />
                                {family.deps.length > 0 && (
                                  <ul className="ml-2 space-y-1 border-l border-[var(--color-line)] pl-1.5">
                                    {family.deps.map((depSeed) => {
                                      const dep = engines.find((item) => item.key === depSeed.key);
                                      if (!dep) return null;
                                      return (
                                        <li key={dep.key}>
                                          <EngineNavRow
                                            item={dep}
                                            engines={engines}
                                            selected={selectedEngineKey === dep.key}
                                            depth={1}
                                            onSelect={setSelectedEngineKey}
                                            onRemove={removeEngine}
                                          />
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                          {seedHierarchy.orphans.length > 0 && (
                            <li className="space-y-1 pt-1">
                              {seedHierarchy.families.length > 0 && (
                                <p className="px-1 text-[9px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                                  Standalone research
                                </p>
                              )}
                              <ul className="space-y-1">
                                {seedHierarchy.orphans.map((orphanSeed) => {
                                  const item = engines.find(
                                    (entry) => entry.key === orphanSeed.key,
                                  );
                                  if (!item) return null;
                                  return (
                                    <li key={item.key}>
                                      <EngineNavRow
                                        item={item}
                                        engines={engines}
                                        selected={selectedEngineKey === item.key}
                                        depth={0}
                                        onSelect={setSelectedEngineKey}
                                        onRemove={removeEngine}
                                      />
                                    </li>
                                  );
                                })}
                              </ul>
                            </li>
                          )}
                        </>
                      )}
                    </ul>
                  </aside>

                  <div className="min-h-0 min-w-0 overflow-hidden border-b border-[var(--color-line)] lg:border-b-0 lg:border-r">
                    <EngineCanvasPreview
                      fill
                      engines={previewEngines}
                      selectedEngineKey={selectedEngineKey}
                      onSelectEngine={setSelectedEngineKey}
                    />
                  </div>

                  <aside
                    className="flex min-h-0 flex-col overflow-hidden"
                    data-testid="engine-inspector-panel"
                  >
                    <div className="shrink-0 border-b border-[var(--color-line)] px-2 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-dim)]">
                        Inspector
                      </p>
                      <p className="text-[9px] text-[var(--color-ink-faint)]">
                        Family cascade · focus follows canvas
                      </p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
                      {selectedEngine ? (
                        <EngineInspectorFrame
                          engines={engines}
                          selectedKey={selectedEngine.key}
                          onSelect={setSelectedEngineKey}
                          onRemove={removeEngine}
                          onUpdate={updateEngine}
                        />
                      ) : (
                        <p className="px-1 py-2 text-[10px] text-[var(--color-ink-faint)]">
                          {engines.length === 0
                            ? 'Add an engine to edit its setup here.'
                            : 'Select an engine from the list or canvas.'}
                        </p>
                      )}
                    </div>
                  </aside>
                </div>
              </section>

              <section
                className={`flex shrink-0 flex-col overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] ${
                  extraModules.length > 0 ? 'max-h-[28%] min-h-0' : ''
                }`}
              >
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <h3 className="text-xs font-medium text-[var(--color-ink)]">
                      Standalone modules (optional)
                    </h3>
                    {extraModules.length === 0 ? (
                      <p className="text-[10px] text-[var(--color-ink-faint)]">
                        Extra nodes outside engines — none added.
                      </p>
                    ) : (
                      <p className="text-[10px] text-[var(--color-ink-faint)]">
                        Extra nodes outside engines.
                      </p>
                    )}
                  </div>
                  <label className="text-xs text-[var(--color-ink-dim)]">
                    <span className="sr-only">Add module</span>
                    <select
                      aria-label="Add module"
                      defaultValue=""
                      onChange={(event) => {
                        const value = event.target.value as ModuleType | '';
                        if (value) addModule(value);
                        event.target.value = '';
                      }}
                      className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                    >
                      <option value="">Add module…</option>
                      {ADDABLE_MODULES.map((entry) => (
                        <option key={entry.type} value={entry.type}>
                          {entry.defaultName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {extraModules.length > 0 && (
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain border-t border-[var(--color-line)] p-2.5">
                    {extraModules.map((item) => {
                      const required = requiredModuleSetupFields(item.type) as ModuleSetupField[];
                      const missing = missingFieldsFromDraft(required, item.draft);
                      return (
                        <article
                          key={item.key}
                          className="space-y-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3"
                          data-testid="extra-seed-module"
                        >
                          <header className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 space-y-1">
                              <input
                                value={item.name}
                                onChange={(event) =>
                                  updateModule(item.key, { name: event.target.value })
                                }
                                aria-label="Extra module name"
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                              />
                              <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                                {item.type}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeModule(item.key)}
                              className="rounded border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-ink-dim)] hover:border-[var(--color-block)] hover:text-[var(--color-block)]"
                            >
                              Remove
                            </button>
                          </header>
                          <ModuleSetupFields
                            requiredFields={required}
                            missingFields={missing}
                            draft={item.draft}
                            onChange={(next) => updateModule(item.key, { draft: next })}
                          />
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {error && <p className="shrink-0 text-sm text-[var(--color-block)]">{error}</p>}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--color-line)] px-4 py-2.5">
              <button
                type="submit"
                disabled={!canSubmitSetup}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create (paper mode)'}
              </button>
              <button
                type="button"
                disabled={!canSkip}
                onClick={() => void createCompany(true)}
                className="rounded-md border border-[var(--color-warn)] px-3 py-1.5 text-xs text-[var(--color-warn)] hover:bg-[var(--color-warn)]/10 disabled:opacity-50"
              >
                Skip setup & open canvas
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function humanize(err: RequestError): string {
  switch (err.code) {
    case 'company_limit_reached':
      return 'You have reached the company limit.';
    case 'module_limit_reached':
      return `Too many modules for one company (limit ${MAX_MODULES_PER_COMPANY}). Remove an engine or standalone module.`;
    case 'invalid_input':
      return err.issues?.map((i) => `${i.path}: ${i.message}`).join('; ') ?? 'Invalid input.';
    case 'engine_template_not_found':
      return 'One of the selected engines is no longer available.';
    case 'engine_template_unavailable':
      return 'One of the selected engines is gated for this milestone.';
    default:
      return `Request failed (${err.code}).`;
  }
}

function engineInstanceLabel(engines: EngineSeed[], item: EngineSeed): string {
  const peers = engines.filter((entry) => entry.templateId === item.templateId);
  if (peers.length <= 1) return item.label;
  const index = peers.findIndex((entry) => entry.key === item.key) + 1;
  return `${item.label} (${index})`;
}

function EngineNavRow(props: {
  item: EngineSeed;
  engines: EngineSeed[];
  selected: boolean;
  depth: number;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  const template = ENGINE_TEMPLATES.find((entry) => entry.id === props.item.templateId);
  const section = template ? engineCreateSection(template) : 'research';
  const displayName = engineInstanceLabel(props.engines, props.item);
  return (
    <div
      className={`flex items-center gap-1 rounded border px-1.5 py-1 ${
        props.selected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
          : 'border-[var(--color-line)] bg-[var(--color-surface-0)]'
      }`}
      data-testid="engine-seed-card"
      data-template-id={props.item.templateId}
      data-engine-section={section}
      data-engine-key={props.item.key}
      data-selected={props.selected ? 'true' : 'false'}
      data-depth={props.depth}
    >
      <button
        type="button"
        onClick={() => props.onSelect(props.item.key)}
        className="min-w-0 flex-1 truncate text-left text-[10px] text-[var(--color-ink)]"
        aria-current={props.selected ? 'true' : undefined}
        aria-label={`Select ${displayName}`}
      >
        <span className="block truncate font-medium">
          {props.depth > 0 ? `↳ ${displayName}` : displayName}
        </span>
        <span className="block truncate text-[9px] text-[var(--color-ink-faint)]">
          {section}
          {props.item.autoDependency ? ' · dep' : ''}
        </span>
      </button>
      <button
        type="button"
        onClick={() => props.onRemove(props.item.key)}
        aria-label={`Remove ${displayName}`}
        className="shrink-0 rounded border border-[var(--color-line)] px-1 py-0.5 text-[9px] text-[var(--color-ink-dim)] hover:border-[var(--color-block)] hover:text-[var(--color-block)]"
      >
        ×
      </button>
    </div>
  );
}

/** Broad sector groups for create (D-106); expands to all specifics on submit. */
function SectorGroupPicker(props: {
  selected: SectorFocusGroupId[];
  onToggle: (groupId: SectorFocusGroupId) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid="create-sector-focuses">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs leading-4 text-[var(--color-ink-dim)]">Sector groups</span>
        <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
          {props.selected.length}/{SECTOR_FOCUS_GROUP_DEFS.length}
        </span>
      </div>
      <p className="text-[10px] text-[var(--color-ink-faint)]">
        Broad categories only — all specifics included by default. Refine in Company → Sectors.
      </p>
      <div className="flex flex-wrap gap-1" data-testid="create-sector-focuses-selected" role="group" aria-label="Sector groups">
        {SECTOR_FOCUS_GROUP_DEFS.map((group) => {
          const on = props.selected.includes(group.id);
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={on}
              onClick={() => props.onToggle(group.id)}
              className={
                on
                  ? 'inline-flex items-center rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] text-[var(--color-accent)]'
                  : 'inline-flex items-center rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)]/50'
              }
            >
              {group.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Compact store trigger; full catalog opens in a popover. */
function EngineStoreMenu(props: {
  title: string;
  description: string;
  catalog: EngineTemplate[];
  addDisabled: boolean;
  onAdd: (templateId: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const availableCount = props.catalog.filter((engine) => engine.available).length;
  const openLabel = `Open ${props.title.toLowerCase()} store`;

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" data-testid={props.testId}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={openLabel}
        title={props.description}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded border border-[var(--color-accent)] px-2 py-1 text-[10px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
      >
        <span>+ {props.title}</span>
        <span className="text-[9px] text-[var(--color-ink-faint)]">{availableCount}</span>
        <span className="text-[8px] text-[var(--color-ink-faint)]" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          aria-label={`${props.title} engines`}
          className="absolute left-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2 shadow-xl"
        >
          <p className="mb-1.5 px-0.5 text-[10px] text-[var(--color-ink-faint)]">
            {props.description}
          </p>
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto overscroll-contain">
            {props.catalog.map((engine) => {
              const locked = !engine.available;
              const disabled = locked || props.addDisabled;
              const label = locked ? `Locked · ${engine.label}` : `+ ${engine.label}`;
              const aria = locked ? `Locked · ${engine.label}` : `Add ${engine.label}`;
              return (
                <button
                  key={engine.id}
                  type="button"
                  disabled={disabled}
                  title={
                    locked
                      ? (engine.unavailableReason ?? engine.description)
                      : props.addDisabled
                        ? 'Engine limit reached'
                        : engine.description
                  }
                  aria-label={aria}
                  onClick={() => {
                    props.onAdd(engine.id);
                    if (!locked) setOpen(false);
                  }}
                  className={
                    locked
                      ? 'rounded border border-dashed border-[var(--color-line)] px-2 py-1.5 text-left text-[11px] text-[var(--color-ink-faint)]'
                      : 'rounded border border-[var(--color-line)] px-2 py-1.5 text-left text-[11px] text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:cursor-not-allowed disabled:opacity-50'
                  }
                >
                  <span className="block font-medium">{label}</span>
                  <span className="mt-0.5 block text-[9px] leading-snug text-[var(--color-ink-faint)]">
                    {locked
                      ? (engine.unavailableReason ?? 'Unavailable this milestone')
                      : engine.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EngineInspectorFrame(props: {
  engines: EngineSeed[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: Partial<EngineSeed>) => void;
}) {
  const selected = props.engines.find((item) => item.key === props.selectedKey);
  if (!selected) return null;

  const selectedTemplate = ENGINE_TEMPLATES.find((entry) => entry.id === selected.templateId);
  const selectedSection = selectedTemplate ? engineCreateSection(selectedTemplate) : 'research';

  // Independent research / orphan: single-engine inspector.
  if (selectedSection !== 'execution' && !selected.cascadedFromKey) {
    return (
      <div data-testid="engine-seed-inspector" data-inspector-mode="standalone">
        <EngineSeedInspector
          item={selected}
          displayLabel={engineInstanceLabel(props.engines, selected)}
          focused
          onRemove={() => props.onRemove(selected.key)}
          onUpdate={(patch) => props.onUpdate(selected.key, patch)}
        />
      </div>
    );
  }

  const rootKey = selected.cascadedFromKey ?? selected.key;
  const root = props.engines.find((item) => item.key === rootKey) ?? selected;
  const deps = props.engines.filter((item) => item.cascadedFromKey === root.key);

  return (
    <div
      className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] p-1.5"
      data-testid="engine-seed-inspector"
      data-inspector-mode="family"
    >
      <p className="px-0.5 text-[9px] uppercase tracking-wide text-[var(--color-ink-faint)]">
        Cascade family
      </p>
      <EngineSeedInspector
        item={root}
        displayLabel={engineInstanceLabel(props.engines, root)}
        focused={props.selectedKey === root.key}
        roleLabel="primary · execution"
        onFocus={() => props.onSelect(root.key)}
        onRemove={() => props.onRemove(root.key)}
        onUpdate={(patch) => props.onUpdate(root.key, patch)}
      />
      {deps.length > 0 && (
        <div className="space-y-1.5 border-t border-dashed border-[var(--color-line)] pt-2">
          <p className="px-0.5 text-[9px] text-[var(--color-ink-faint)]">
            Research deps · inherit topic / capital / exit from primary
          </p>
          {deps.map((dep) => (
            <EngineSeedInspector
              key={dep.key}
              item={dep}
              displayLabel={engineInstanceLabel(props.engines, dep)}
              focused={props.selectedKey === dep.key}
              roleLabel="cascaded · research"
              compactCascade
              onFocus={() => props.onSelect(dep.key)}
              onRemove={() => props.onRemove(dep.key)}
              onUpdate={(patch) => props.onUpdate(dep.key, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EngineSeedInspector(props: {
  item: EngineSeed;
  displayLabel: string;
  focused?: boolean;
  roleLabel?: string;
  compactCascade?: boolean;
  onFocus?: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<EngineSeed>) => void;
}) {
  const { item, displayLabel, onRemove, onUpdate } = props;
  const engine = ENGINE_TEMPLATES.find((entry) => entry.id === item.templateId);
  const section: EngineCreateSection = engine ? engineCreateSection(engine) : 'research';
  const engineInputs =
    engine?.inputs.filter((input) => input.key !== 'focus' && input.key !== 'topicScope') ?? [];
  const required: ModuleSetupField[] = ['topic_sector', 'capital_allocation', 'target_exit'];
  const missing = missingFieldsFromDraft(required, item.draft);
  const showFullFields = !props.compactCascade || Boolean(props.focused);

  return (
    <article
      className={`space-y-1.5 rounded border p-2 ${
        props.focused
          ? 'border-[var(--color-accent)] bg-[var(--color-surface-1)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface-1)]/80'
      }`}
      data-testid={props.focused ? 'engine-inspector-focus' : 'engine-inspector-member'}
      data-engine-section={section}
      data-template-id={item.templateId}
      data-focused={props.focused ? 'true' : 'false'}
    >
      <header className="flex items-start justify-between gap-1.5">
        <button
          type="button"
          onClick={props.onFocus}
          className="min-w-0 flex-1 text-left"
          disabled={!props.onFocus}
        >
          <div className="flex flex-wrap items-center gap-1">
            <h4 className="text-xs font-medium text-[var(--color-ink)]">{displayLabel}</h4>
            {item.autoDependency && (
              <span
                className="rounded border border-[var(--color-line)] px-1 py-px text-[9px] text-[var(--color-ink-faint)]"
                title="research dependency"
                data-testid="engine-auto-dep"
              >
                dep
              </span>
            )}
          </div>
          {props.roleLabel && (
            <p className="mt-0.5 text-[9px] text-[var(--color-ink-faint)]">{props.roleLabel}</p>
          )}
          {!props.compactCascade && (
            <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-[var(--color-ink-faint)]">
              {item.description}
            </p>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${displayLabel}`}
          className="shrink-0 rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-block)] hover:text-[var(--color-block)]"
        >
          Remove
        </button>
      </header>

      {showFullFields && (
        <>
          {engineInputs.map((input) => (
            <label key={input.key} className="block space-y-0.5">
              <span className="text-[10px] text-[var(--color-ink-dim)]">{input.label}</span>
              {input.kind === 'select' ? (
                <select
                  value={item.inputs[input.key] ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      inputs: { ...item.inputs, [input.key]: e.target.value },
                    })
                  }
                  aria-label={input.label}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[11px] outline-none"
                >
                  {input.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={item.inputs[input.key] ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      inputs: { ...item.inputs, [input.key]: e.target.value },
                    })
                  }
                  placeholder={input.placeholder}
                  aria-label={input.label}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1.5 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]"
                />
              )}
            </label>
          ))}

          {props.compactCascade && (
            <p className="text-[9px] text-[var(--color-ink-faint)]">
              Cascaded values from primary (editable; edits stay on this dep)
            </p>
          )}

          <ModuleSetupFields
            compact
            requiredFields={required}
            missingFields={missing}
            draft={item.draft}
            onChange={(next) => onUpdate({ draft: next })}
          />
        </>
      )}

      {!showFullFields && (
        <p className="text-[9px] text-[var(--color-ink-faint)]">
          topic: {item.draft.topicSectors || '—'} · capital: {item.draft.allocationValue || '—'}
        </p>
      )}
    </article>
  );
}
