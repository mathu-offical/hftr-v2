'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ENGINE_TEMPLATES,
  defaultEngineCapitalEnvelope,
  defaultTargetExitLocal,
  requiredModuleSetupFields,
  type ModuleSetupField,
  type ModuleType,
} from '@hftr/contracts';
import {
  EMPTY_MODULE_SETUP_DRAFT,
  ModuleSetupFields,
  missingFieldsFromDraft,
  moduleSetupInputFromDraft,
  type ModuleSetupDraft,
} from '@/components/canvas/ModuleSetupFields';
import { api, RequestError } from '@/lib/client';

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
};

type ModuleSeed = {
  key: string;
  type: ModuleType;
  name: string;
  draft: ModuleSetupDraft;
};

const QUICK_ADD_ENGINES: Array<{ templateId: string; buttonLabel: string }> = [
  { templateId: 'engine_day_trading', buttonLabel: 'Day trading' },
  { templateId: 'engine_trend_research', buttonLabel: 'Trend research' },
];

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
 * cards with inline definition (template inputs + shared setup). Optional standalone
 * modules. Company templates are quick-add buttons only.
 */
export function CreateCompanyForm() {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [philosophy, setPhilosophy] = useState('');
  const [seedDollars, setSeedDollars] = useState('10000');
  const [engines, setEngines] = useState<EngineSeed[]>([]);
  const [extraModules, setExtraModules] = useState<ModuleSeed[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableEngines = ENGINE_TEMPLATES.filter((engine) => engine.available);

  function makeEngineSeed(templateId: string, seedCreditsCents: number): EngineSeed | null {
    const engine = availableEngines.find((item) => item.id === templateId);
    if (!engine) return null;
    return {
      key: `${formId}-eng-${crypto.randomUUID()}`,
      templateId: engine.id,
      label: engine.label,
      description: engine.description,
      inputs: defaultEngineInputs(engine.id),
      draft: defaultEngineDraft(seedCreditsCents),
    };
  }

  function addEngine(templateId: string) {
    const seed = makeEngineSeed(templateId, seedCentsFromDollars(seedDollars));
    if (!seed) return;
    setEngines((prev) => [...prev, seed]);
  }

  function removeEngine(key: string) {
    setEngines((prev) => prev.filter((item) => item.key !== key));
  }

  function updateEngine(key: string, patch: Partial<EngineSeed>) {
    setEngines((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addModule(type: ModuleType) {
    const entry = ADDABLE_MODULES.find((item) => item.type === type);
    if (!entry) return;
    setExtraModules((prev) => [
      ...prev,
      {
        key: `${formId}-mod-${crypto.randomUUID()}`,
        type: entry.type,
        name: entry.defaultName,
        draft: defaultStandaloneModuleDraft(entry.type, seedCentsFromDollars(seedDollars)),
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
  const canCreate = engines.length >= 1 && !busy;
  const canSubmitSetup = canCreate && !hasBlockingMissing;
  // Skip may omit topic/capital/exit but still needs template inputs (module-store parity).
  const canSkip = canCreate && engineInputsMissing.length === 0;

  async function createCompany(skipSetup: boolean) {
    if (engines.length < 1) {
      setError('Add at least one engine to create this company.');
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
          engines: enginesPayload,
          extraModules: modulesPayload.length > 0 ? modulesPayload : undefined,
        },
      });
      router.push(`/companies/${company.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestError ? humanize(err) : 'Something went wrong.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        New company
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void createCompany(false);
      }}
      className="flex max-h-[min(42rem,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)]"
    >
      <header className="shrink-0 border-b border-[var(--color-line)] px-6 py-4">
        <h2 className="text-lg font-medium">New company</h2>
        <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
          Add at least one engine. Each engine card holds its definition; remove freely until
          create.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-6">
        <label className="block space-y-1.5">
          <span className="text-sm text-[var(--color-ink-dim)]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="e.g. Momentum Desk"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-[var(--color-ink-dim)]">
            Philosophy — how should this company think?
          </span>
          <textarea
            value={philosophy}
            onChange={(e) => setPhilosophy(e.target.value)}
            required
            rows={4}
            maxLength={4000}
            placeholder="Patient swing trading on large-cap tech. Prefer strong evidence over speed; cut losers fast."
            className="w-full resize-none rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-[var(--color-ink-dim)]">Paper seed credits (USD)</span>
          <input
            value={seedDollars}
            onChange={(e) => {
              const next = e.target.value;
              setSeedDollars(next);
              refreshSeedDefaults(next);
            }}
            inputMode="numeric"
            className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        <section className="space-y-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-[var(--color-ink)]">Engines</h3>
              <p className="text-[11px] text-[var(--color-ink-faint)]">
                Required · at least one. Inline definition matches module-store insert (inputs +
                shared topic/capital/exit).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_ADD_ENGINES.map((preset) => (
                <button
                  key={preset.templateId}
                  type="button"
                  onClick={() => addEngine(preset.templateId)}
                  className="rounded-md border border-[var(--color-accent)] px-2 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                >
                  Quick add · {preset.buttonLabel}
                </button>
              ))}
              <label className="text-xs text-[var(--color-ink-dim)]">
                <span className="sr-only">Add engine</span>
                <select
                  aria-label="Add engine"
                  defaultValue=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value) addEngine(value);
                    event.target.value = '';
                  }}
                  className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                >
                  <option value="">Add engine…</option>
                  {availableEngines.map((engine) => (
                    <option key={engine.id} value={engine.id}>
                      {engine.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {engines.length === 0 && (
            <p
              className="rounded-md border border-dashed border-[var(--color-warn)] px-3 py-2 text-[11px] text-[var(--color-warn)]"
              data-testid="engines-empty-hint"
            >
              Add at least one engine to create this company.
            </p>
          )}

          {engines.map((item) => {
            const engine = ENGINE_TEMPLATES.find((entry) => entry.id === item.templateId);
            const engineInputs =
              engine?.inputs.filter(
                (input) => input.key !== 'focus' && input.key !== 'topicScope',
              ) ?? [];
            const required = requiredSetupForEngine(item.templateId);
            const missing = missingFieldsFromDraft(required, item.draft);
            return (
              <article
                key={item.key}
                className="space-y-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3"
                data-testid="engine-seed-card"
              >
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium text-[var(--color-ink)]">{item.label}</h4>
                    <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-faint)]">
                      {item.description}
                    </p>
                    <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                      engine · {item.templateId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEngine(item.key)}
                    className="rounded border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-ink-dim)] hover:border-[var(--color-block)] hover:text-[var(--color-block)]"
                  >
                    Remove
                  </button>
                </header>

                {engineInputs.map((input) => (
                  <label key={input.key} className="block space-y-1">
                    <span className="text-[11px] text-[var(--color-ink-dim)]">{input.label}</span>
                    {input.kind === 'select' ? (
                      <select
                        value={item.inputs[input.key] ?? ''}
                        onChange={(e) =>
                          updateEngine(item.key, {
                            inputs: { ...item.inputs, [input.key]: e.target.value },
                          })
                        }
                        aria-label={input.label}
                        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none"
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
                          updateEngine(item.key, {
                            inputs: { ...item.inputs, [input.key]: e.target.value },
                          })
                        }
                        placeholder={input.placeholder}
                        aria-label={input.label}
                        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
                      />
                    )}
                  </label>
                ))}

                <p className="text-[10px] leading-snug text-[var(--color-ink-faint)]">
                  Master topic/sector cascades to engine nodes (overridable). Capital defaults to an
                  equal split of paper seed across capital-bearing members; exit defaults to one
                  week ahead.
                </p>
                <ModuleSetupFields
                  requiredFields={required}
                  missingFields={missing}
                  draft={item.draft}
                  onChange={(next) => updateEngine(item.key, { draft: next })}
                />
              </article>
            );
          })}
        </section>

        <section className="space-y-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-[var(--color-ink)]">
                Standalone modules (optional)
              </h3>
              <p className="text-[11px] text-[var(--color-ink-faint)]">
                Extra nodes outside engines. Not required for create.
              </p>
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

          {extraModules.length === 0 && (
            <p className="text-[11px] text-[var(--color-ink-faint)]">No standalone modules.</p>
          )}

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
                      onChange={(event) => updateModule(item.key, { name: event.target.value })}
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
        </section>

        {error && <p className="text-sm text-[var(--color-block)]">{error}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap gap-3 border-t border-[var(--color-line)] px-6 py-4">
        <button
          type="submit"
          disabled={!canSubmitSetup}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create (paper mode)'}
        </button>
        <button
          type="button"
          disabled={!canSkip}
          onClick={() => void createCompany(true)}
          className="rounded-lg border border-[var(--color-warn)] px-4 py-2 text-sm text-[var(--color-warn)] hover:bg-[var(--color-warn)]/10 disabled:opacity-50"
        >
          Skip setup & open canvas
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function humanize(err: RequestError): string {
  switch (err.code) {
    case 'company_limit_reached':
      return 'You have reached the company limit.';
    case 'module_limit_reached':
      return 'Too many modules for one company.';
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
