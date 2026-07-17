'use client';

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COMPANY_TEMPLATES,
  ENGINE_TEMPLATES,
  requiredModuleSetupFields,
  type CompanyTemplateId,
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

type ExtraSeed =
  | {
      key: string;
      kind: 'module';
      type: ModuleType;
      name: string;
      draft: ModuleSetupDraft;
    }
  | {
      key: string;
      kind: 'engine';
      templateId: string;
      label: string;
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
 * Company creation flow (product-spec §onboarding): name + philosophy prompt,
 * paper mode with seed credits, template graph, and per-module inline setup
 * with optional extra modules/engines.
 */
export function CreateCompanyForm() {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [philosophy, setPhilosophy] = useState('');
  const [seedDollars, setSeedDollars] = useState('10000');
  const [template, setTemplate] = useState<CompanyTemplateId>('blank');
  const [templateDrafts, setTemplateDrafts] = useState<Record<number, ModuleSetupDraft>>({});
  const [extras, setExtras] = useState<ExtraSeed[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateModules = COMPANY_TEMPLATES[template].modules;
  const setupModules = useMemo(
    () =>
      templateModules
        .map((module, index) => ({
          index,
          module,
          required: requiredModuleSetupFields(module.type) as ModuleSetupField[],
        }))
        .filter((entry) => entry.required.length > 0),
    [templateModules],
  );

  const availableEngines = ENGINE_TEMPLATES.filter((engine) => engine.available);

  function draftForTemplate(index: number): ModuleSetupDraft {
    return templateDrafts[index] ?? EMPTY_MODULE_SETUP_DRAFT;
  }

  function setDraftForTemplate(index: number, draft: ModuleSetupDraft) {
    setTemplateDrafts((prev) => ({ ...prev, [index]: draft }));
  }

  function selectTemplate(next: CompanyTemplateId) {
    setTemplate(next);
    setTemplateDrafts({});
  }

  function addModule(type: ModuleType) {
    const entry = ADDABLE_MODULES.find((item) => item.type === type);
    if (!entry) return;
    setExtras((prev) => [
      ...prev,
      {
        key: `${formId}-mod-${crypto.randomUUID()}`,
        kind: 'module',
        type: entry.type,
        name: entry.defaultName,
        draft: { ...EMPTY_MODULE_SETUP_DRAFT },
      },
    ]);
  }

  function addEngine(templateId: string) {
    const engine = availableEngines.find((item) => item.id === templateId);
    if (!engine) return;
    setExtras((prev) => [
      ...prev,
      {
        key: `${formId}-eng-${crypto.randomUUID()}`,
        kind: 'engine',
        templateId: engine.id,
        label: engine.label,
        draft: { ...EMPTY_MODULE_SETUP_DRAFT },
      },
    ]);
  }

  function updateExtra(key: string, patch: Partial<ExtraSeed>) {
    setExtras((prev) =>
      prev.map((item) => (item.key === key ? ({ ...item, ...patch } as ExtraSeed) : item)),
    );
  }

  function removeExtra(key: string) {
    setExtras((prev) => prev.filter((item) => item.key !== key));
  }

  const templateMissing = setupModules.flatMap((entry) =>
    missingFieldsFromDraft(entry.required, draftForTemplate(entry.index)).map(
      (field) => `${entry.index}:${field}`,
    ),
  );
  const extrasMissing = extras.flatMap((item) => {
    const required =
      item.kind === 'module'
        ? (requiredModuleSetupFields(item.type) as ModuleSetupField[])
        : ([
            ...new Set(
              ENGINE_TEMPLATES.find((engine) => engine.id === item.templateId)?.modules.flatMap(
                (module) => requiredModuleSetupFields(module.type),
              ) ?? [],
            ),
          ] as ModuleSetupField[]);
    return missingFieldsFromDraft(required, item.draft).map((field) => `${item.key}:${field}`);
  });
  const hasBlockingMissing = templateMissing.length + extrasMissing.length > 0;
  const hasAnySetup =
    setupModules.length > 0 ||
    extras.some((item) => {
      const required =
        item.kind === 'module'
          ? requiredModuleSetupFields(item.type)
          : ([
              ...new Set(
                ENGINE_TEMPLATES.find((engine) => engine.id === item.templateId)?.modules.flatMap(
                  (module) => requiredModuleSetupFields(module.type),
                ) ?? [],
              ),
            ] as ModuleSetupField[]);
      return required.length > 0;
    });

  async function createCompany(skipSetup: boolean) {
    setBusy(true);
    setError(null);
    try {
      const seed = Math.max(0, Math.round(Number(seedDollars) || 0)) * 100;
      const templateModuleSetups = skipSetup
        ? undefined
        : setupModules.map((entry) => ({
            moduleIndex: entry.index,
            setup: moduleSetupInputFromDraft(draftForTemplate(entry.index), entry.required),
          }));

      const extraModules = extras
        .filter((item): item is Extract<ExtraSeed, { kind: 'module' }> => item.kind === 'module')
        .map((item) => {
          const catalog = ADDABLE_MODULES.find((entry) => entry.type === item.type);
          const required = requiredModuleSetupFields(item.type) as ModuleSetupField[];
          return {
            type: item.type,
            name: item.name,
            config: catalog?.defaultConfig ?? {},
            setup: skipSetup ? undefined : moduleSetupInputFromDraft(item.draft, required),
          };
        });

      const extraEngines = extras
        .filter((item): item is Extract<ExtraSeed, { kind: 'engine' }> => item.kind === 'engine')
        .map((item) => {
          const engine = ENGINE_TEMPLATES.find((entry) => entry.id === item.templateId);
          const required = [
            ...new Set(
              engine?.modules.flatMap((module) => requiredModuleSetupFields(module.type)) ?? [],
            ),
          ] as ModuleSetupField[];
          return {
            templateId: item.templateId,
            inputs: {},
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
          template,
          templateModuleSetups,
          extraModules: extraModules.length > 0 ? extraModules : undefined,
          extraEngines: extraEngines.length > 0 ? extraEngines : undefined,
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
      className="w-full max-w-3xl space-y-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-6"
    >
      <h2 className="text-lg font-medium">New company</h2>

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
          onChange={(e) => setSeedDollars(e.target.value)}
          inputMode="numeric"
          className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
        />
      </label>

      <div className="space-y-1.5">
        <span className="text-sm text-[var(--color-ink-dim)]">Start from</span>
        <div className="grid grid-cols-1 gap-2">
          {Object.values(COMPANY_TEMPLATES).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTemplate(t.id)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                template === t.id
                  ? 'border-[var(--color-accent)]'
                  : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
              }`}
            >
              <span className="font-medium">{t.label}</span>
              <span className="block text-xs text-[var(--color-ink-faint)]">{t.description}</span>
            </button>
          ))}
        </div>
      </div>

      {(setupModules.length > 0 || templateModules.length > 0) && (
        <section className="space-y-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--color-ink)]">Template setup</h3>
            <p className="text-[11px] text-[var(--color-ink-faint)]">
              Inline fields per seeded module. Capital and exit apply only to capital-bearing nodes.
            </p>
          </div>

          {templateModules
            .filter((module) => requiredModuleSetupFields(module.type).length === 0)
            .map((module) => (
              <div
                key={`plain-${module.name}`}
                className="rounded-md border border-dashed border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-faint)]"
              >
                Included · {module.name} ({module.type}) — no setup required
              </div>
            ))}

          {setupModules.map((entry) => {
            const draft = draftForTemplate(entry.index);
            const missing = missingFieldsFromDraft(entry.required, draft);
            return (
              <article
                key={`setup-${entry.index}`}
                className="space-y-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3"
                data-testid={`template-module-setup-${entry.index}`}
              >
                <header className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-medium text-[var(--color-ink)]">
                    {entry.module.name}
                  </h4>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                    {entry.module.type}
                  </span>
                </header>
                <ModuleSetupFields
                  requiredFields={entry.required}
                  missingFields={missing}
                  draft={draft}
                  onChange={(next) => setDraftForTemplate(entry.index, next)}
                />
              </article>
            );
          })}
        </section>
      )}

      <section className="space-y-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-0)] p-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-[var(--color-ink)]">Add modules & engines</h3>
            <p className="text-[11px] text-[var(--color-ink-faint)]">
              Stack additional nodes or full engines on top of the template seed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

        {extras.length === 0 && (
          <p className="text-[11px] text-[var(--color-ink-faint)]">No extras yet.</p>
        )}

        {extras.map((item) => {
          const required =
            item.kind === 'module'
              ? (requiredModuleSetupFields(item.type) as ModuleSetupField[])
              : ([
                  ...new Set(
                    ENGINE_TEMPLATES.find(
                      (engine) => engine.id === item.templateId,
                    )?.modules.flatMap((module) => requiredModuleSetupFields(module.type)) ?? [],
                  ),
                ] as ModuleSetupField[]);
          const missing = missingFieldsFromDraft(required, item.draft);
          return (
            <article
              key={item.key}
              className="space-y-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3"
              data-testid={`extra-seed-${item.kind}`}
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  {item.kind === 'module' ? (
                    <input
                      value={item.name}
                      onChange={(event) => updateExtra(item.key, { name: event.target.value })}
                      aria-label="Extra module name"
                      className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                    />
                  ) : (
                    <h4 className="text-sm font-medium text-[var(--color-ink)]">{item.label}</h4>
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">
                    {item.kind === 'module' ? item.type : `engine · ${item.templateId}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeExtra(item.key)}
                  className="rounded border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-ink-dim)] hover:border-[var(--color-block)] hover:text-[var(--color-block)]"
                >
                  Remove
                </button>
              </header>
              <ModuleSetupFields
                requiredFields={required}
                missingFields={missing}
                draft={item.draft}
                onChange={(next) => updateExtra(item.key, { draft: next })}
              />
            </article>
          );
        })}
      </section>

      {error && <p className="text-sm text-[var(--color-block)]">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || hasBlockingMissing}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create (paper mode)'}
        </button>
        {hasAnySetup && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void createCompany(true)}
            className="rounded-lg border border-[var(--color-warn)] px-4 py-2 text-sm text-[var(--color-warn)] hover:bg-[var(--color-warn)]/10 disabled:opacity-50"
          >
            Skip setup & open canvas
          </button>
        )}
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
    default:
      return `Request failed (${err.code}).`;
  }
}
