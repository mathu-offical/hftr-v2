import { z } from 'zod';

/**
 * Numeric + Temporal Reference Architecture contracts (D-008 / D-009).
 * See agent-docs/architecture/number-handling.md.
 *
 * LLMs only ever see ValueRefHandle + descriptor blocks. Raw values live in the
 * numeric_values store as fixed-point integers and are produced exclusively by
 * data sources, the ledger, the clock/calendar, seed catalogs, operator input,
 * or the deterministic calculator.
 */

export const NumericKind = z.enum([
  'price',
  'quantity',
  'pct',
  'bps',
  'usd_cents',
  'ratio',
  'count',
  'volatility',
  'probability',
  // temporal kinds (D-009)
  'timestamp_ms',
  'duration_ms',
  'session_date',
  'schedule_ref',
]);
export type NumericKind = z.infer<typeof NumericKind>;

export const TEMPORAL_KINDS: ReadonlySet<NumericKind> = new Set([
  'timestamp_ms',
  'duration_ms',
  'session_date',
  'schedule_ref',
]);

export const ValueSourceClass = z.enum([
  'live_feed',
  'broker_state',
  'ledger',
  'derived',
  'band_seed',
  'operator_input',
  'clock',
  'calendar',
]);
export type ValueSourceClass = z.infer<typeof ValueSourceClass>;

/** Bounds a value must satisfy; checked by the sanity gauntlet at every morph point. */
export const SanityEnvelope = z.object({
  minInt: z.string().nullable(), // bigint as string (JSON-safe)
  maxInt: z.string().nullable(),
  maxAgeMs: z.number().int().positive().nullable(),
  mustBePositive: z.boolean().default(false),
});
export type SanityEnvelope = z.infer<typeof SanityEnvelope>;

/** The only numeric shape allowed in LLM-facing schemas. */
export const ValueRefHandle = z.object({ ref: z.string().startsWith('nv_') });
export type ValueRefHandle = z.infer<typeof ValueRefHandle>;

/** Full stored value (server-side only; never serialized into model payloads). */
export const StoredValue = z.object({
  ref: z.string().startsWith('nv_'),
  kind: NumericKind,
  unit: z.string(),
  scale: z.number().int().min(0).max(12),
  valueInt: z.bigint(),
  timezone: z.string().nullable(), // IANA; mandatory for temporal kinds
  sourceClass: ValueSourceClass,
  sourceId: z.string(),
  capturedAt: z.string().datetime(),
  ttlMs: z.number().int().positive(),
  parentRefs: z.array(z.string()),
  sanity: SanityEnvelope,
  companyId: z.string().uuid().nullable(),
  moduleId: z.string().uuid().nullable(),
});
export type StoredValue = z.infer<typeof StoredValue>;

// ── Qualitative descriptors (what models reason over) ───────────────────────

export const BandPosition = z.enum(['below_min', 'low', 'typical', 'high', 'above_max']);
export type BandPosition = z.infer<typeof BandPosition>;

export const DeltaClass = z.enum(['large_down', 'small_down', 'flat', 'small_up', 'large_up']);
export type DeltaClass = z.infer<typeof DeltaClass>;

export const FreshnessClass = z.enum(['fresh', 'aging', 'stale']);
export type FreshnessClass = z.infer<typeof FreshnessClass>;

export const SessionPhase = z.enum([
  'pre_market',
  'open',
  'midday',
  'power_hour',
  'closed',
  'overnight',
]);
export type SessionPhase = z.infer<typeof SessionPhase>;

export const TimeToCloseClass = z.enum(['ample', 'tight', 'imminent', 'closed']);
export const ElapsedClass = z.enum(['just_now', 'recent', 'hours', 'days']);

export const ValueDescriptor = z.object({
  ref: z.string().startsWith('nv_'),
  kind: NumericKind,
  band: BandPosition.nullable(),
  deltaClass: DeltaClass.nullable(),
  freshness: FreshnessClass,
  vsThreshold: z.enum(['above', 'at', 'below']).nullable(),
});
export type ValueDescriptor = z.infer<typeof ValueDescriptor>;

/** Read-only context header prepended to every model call (D-009). */
export const TemporalOrientation = z.object({
  nowIso: z.string().datetime(),
  venueTimezone: z.string(),
  sessionPhase: SessionPhase,
  timeToClose: TimeToCloseClass,
});
export type TemporalOrientation = z.infer<typeof TemporalOrientation>;

// ── Calculator operation shapes ──────────────────────────────────────────────

export const CalcExprNode: z.ZodType<CalcExprNodeT> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('ref'), ref: z.string().startsWith('nv_') }),
    z.object({
      op: z.enum(['add', 'sub', 'mul', 'div', 'min', 'max']),
      args: z.array(CalcExprNode).min(2),
    }),
    z.object({ op: z.enum(['abs', 'neg']), args: z.array(CalcExprNode).length(1) }),
    z.object({
      op: z.literal('clamp'),
      args: z.array(CalcExprNode).length(3), // value, min, max
    }),
  ]),
);
export type CalcExprNodeT =
  | { op: 'ref'; ref: string }
  | { op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max'; args: CalcExprNodeT[] }
  | { op: 'abs' | 'neg'; args: CalcExprNodeT[] }
  | { op: 'clamp'; args: CalcExprNodeT[] };

export const CalcRequest = z.union([
  z.object({
    kind: z.literal('static'),
    opName: z.string(),
    args: z.record(z.string().startsWith('nv_')),
  }),
  z.object({
    kind: z.literal('expr'),
    expr: CalcExprNode,
    outputKind: NumericKind,
    outputUnit: z.string(),
  }),
]);
export type CalcRequest = z.infer<typeof CalcRequest>;

export const CalcStatus = z.enum(['ok', 'stale_input', 'sanity_block', 'unit_error']);
export type CalcStatus = z.infer<typeof CalcStatus>;

export const CalcResult = z.object({
  status: CalcStatus,
  outputRef: z.string().startsWith('nv_').nullable(),
  descriptor: ValueDescriptor.nullable(),
  failureDetail: z.string().nullable(),
});
export type CalcResult = z.infer<typeof CalcResult>;
