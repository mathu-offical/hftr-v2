import type { ModuleType } from './modules';

/**
 * D-042: v1 process layers owned by each canvas module type.
 * Detail modal renders these as observe + bounded-tune sections.
 * Stage adjacency is immutable — layers are not separately wireable.
 */

export interface ProcessLayerDef {
  id: string;
  label: string;
  v1Refs: readonly string[];
  /** Whether operator/LLM may adjust in-envelope controls for this layer. */
  tunable: boolean;
  description: string;
}

export const PROCESS_LAYERS_BY_MODULE: Record<ModuleType, readonly ProcessLayerDef[]> = {
  research: [
    {
      id: 'gather',
      label: 'Gather',
      v1Refs: ['research_topic', 'seed_research_topics', 'decompose_topic'],
      tunable: true,
      description: 'Opportunistic multi-source discovery within topic scope and admission policy.',
    },
    {
      id: 'validate',
      label: 'Validate',
      v1Refs: ['research.validate'],
      tunable: false,
      description: 'Model-free sanity checks against existing evidence before synthesis.',
    },
    {
      id: 'synthesize_admit',
      label: 'Synthesize & admit',
      v1Refs: ['research.synthesize', 'research.admit'],
      tunable: true,
      description: 'Optional strategic synthesis and library admission (auto or operator gate).',
    },
  ],
  librarian: [
    {
      id: 'query_relevance',
      label: 'Query & relevance',
      v1Refs: ['knowledge-stacks'],
      tunable: true,
      description: 'Score and prioritize existing library resources across relevance metrics.',
    },
    {
      id: 'reorganize',
      label: 'Reorganize',
      v1Refs: ['topics', 'library_membership'],
      tunable: true,
      description: 'Topic membership and synopsis hygiene; seed_keeper protects seeded mechanisms.',
    },
  ],
  library: [
    {
      id: 'membership',
      label: 'Membership & admission',
      v1Refs: ['library_concepts'],
      tunable: false,
      description: 'Accepted / proposed / rejected curation states and galaxy membership.',
    },
  ],
  live_api: [
    {
      id: 'hydrate',
      label: 'Hydrate',
      v1Refs: ['live_data'],
      tunable: true,
      description: 'Deterministic poll/stream of venue instruments into ValueRefs.',
    },
  ],
  trend: [
    {
      id: 'scan',
      label: 'Scan',
      v1Refs: ['trend', 'emit_trends'],
      tunable: true,
      description: 'Regime-aware trend curation from libraries + live feeds.',
    },
    {
      id: 'lead',
      label: 'Lead package',
      v1Refs: ['lead', 'nominate_leads'],
      tunable: true,
      description: 'Cross-symbol lead packaging (v1 lead — not a separate canvas node).',
    },
  ],
  trading: [
    {
      id: 'ingest',
      label: 'Ingest & bind',
      v1Refs: ['lead', 'nominate_leads', 'bind_routing_pattern_shape'],
      tunable: true,
      description:
        'D-244: Trading desk ingests one admitted Lead, binds strategy family + policy envelope.',
    },
    {
      id: 'tree',
      label: 'Tactical tree',
      v1Refs: ['tree', 'expand_tree'],
      tunable: true,
      description: 'Decision-tree shape and strategic/tactical lever positions.',
    },
    {
      id: 'compose',
      label: 'Compose orders',
      v1Refs: ['OrderCompositionPlan', 'compile_instruction'],
      tunable: true,
      description:
        'D-244: OrderCompositionPlan legs from tree roles + policy (distinct from POV child slices).',
    },
    {
      id: 'compile',
      label: 'Compile',
      v1Refs: ['compile', 'compile_instruction'],
      tunable: true,
      description: 'Execution-tier levers → ActionInstruction (last model-bearing stage).',
    },
    {
      id: 'dispatch',
      label: 'Dispatch',
      v1Refs: ['dispatch', 'submit_and_verify'],
      tunable: false,
      description: 'Model-free broker submit and verification — not LLM-editable.',
    },
    {
      id: 'loop_refine',
      label: 'Loop refine',
      v1Refs: ['loop_refine', 'retune_tree'],
      tunable: true,
      description: 'Bounded recovery re-tune of the same tree after verification outcomes.',
    },
  ],
  policy: [
    {
      id: 'envelope',
      label: 'Policy envelope',
      v1Refs: ['BrokerPolicyEnvelope', 'guardrails'],
      tunable: false,
      description: 'Immutable envelope binding; only band positions elsewhere are mutable.',
    },
  ],
  analyzer: [
    {
      id: 'reconcile',
      label: 'Reconcile & loopback',
      v1Refs: ['verification', 'ActionTrace'],
      tunable: true,
      description: 'Execution monitor and verification feedback into research/trend.',
    },
    {
      id: 'concat_emit',
      label: 'Concat & emit',
      v1Refs: ['analyzer_concat', 'engine_data_out'],
      tunable: true,
      description:
        'D-091: model-free merge of inbound research/library/live packages; emit to library, desk stream, or verify loopback.',
    },
  ],
  math: [
    {
      id: 'valueref',
      label: 'ValueRef & calc',
      v1Refs: ['calculator', 'ValueRef'],
      tunable: false,
      description: 'Typed Math op families; lineage always traces to live/ledger/clock sources.',
    },
  ],
  clock: [
    {
      id: 'authority',
      label: 'Temporal authority',
      v1Refs: ['clock', 'market_calendar'],
      tunable: false,
      description:
        'Company singleton injectable clock + venue session orientation (D-009 / D-088). Emits now/session refs only.',
    },
  ],
  time: [
    {
      id: 'transform',
      label: 'Temporal transform',
      v1Refs: ['temporal_calc', 'session_window'],
      tunable: true,
      description:
        'Elapsed, duration add, TZ convert, session window, and schedule refs. Models nominate op/bands only.',
    },
  ],
  holding_fund: [
    {
      id: 'source',
      label: 'Capital source',
      v1Refs: ['fund_topology'],
      tunable: true,
      description: 'Topology-only capital source until fund transfers ship.',
    },
  ],
  fund_router: [
    {
      id: 'route',
      label: 'Fund route policy',
      v1Refs: ['fund_topology'],
      tunable: true,
      description: 'Approval mode and targets; amounts resolve via Math only.',
    },
  ],
  simulator: [
    {
      id: 'paper_parallel',
      label: 'Paper parallel runs',
      v1Refs: ['simulation.run'],
      tunable: true,
      description: 'Parallel paper runs of a trading config with optional feed_target.',
    },
  ],
  generator: [
    {
      id: 'spec_draft',
      label: 'Spec draft',
      v1Refs: ['module_generator'],
      tunable: true,
      description: 'Spec-driven draft module creation (operator confirms).',
    },
  ],
  display: [
    {
      id: 'projection',
      label: 'Projection',
      v1Refs: ['display'],
      tunable: true,
      description: 'Visual sink for tables, lists, ledgers, charts, graphs.',
    },
  ],
};

export function processLayersForModule(type: ModuleType): readonly ProcessLayerDef[] {
  return PROCESS_LAYERS_BY_MODULE[type];
}
