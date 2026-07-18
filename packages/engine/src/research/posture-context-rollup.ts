/**
 * Deterministic position↔tape rollup for posture narrative (D-120).
 * Bands/symbols/status words only — no raw marks, qty, or cents.
 */

export type PostureContextRollupInput = {
  heldSymbols: string[];
  watchSymbols: string[];
  pipelineSymbols: string[];
  moverSymbols: string[];
  moversTitle: string | null;
  moversBand: string | null;
  sectorTitle: string | null;
  sectorBand: string | null;
  dailyTitle: string | null;
  dailyBand: string | null;
  phase: string;
};

export type PostureContextRollup = {
  body: string;
  summaryLines: string[];
  justificationLines: string[];
};

function uniqUpper(symbols: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const s = raw.trim().toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function formatList(symbols: string[], max = 8): string {
  if (symbols.length === 0) return 'none';
  const head = symbols.slice(0, max);
  const more = symbols.length > max ? ` (+${symbols.length - max})` : '';
  return `${head.join(', ')}${more}`;
}

/** Build seal-grounded markdown with held/watch/pipeline vs movers overlap. */
export function buildPostureContextRollup(input: PostureContextRollupInput): PostureContextRollup {
  const held = uniqUpper(input.heldSymbols);
  const watch = uniqUpper(input.watchSymbols);
  const pipeline = uniqUpper(input.pipelineSymbols);
  const movers = uniqUpper(input.moverSymbols);
  const moverSet = new Set(movers);

  const heldOnTape = held.filter((s) => moverSet.has(s));
  const watchOnTape = watch.filter((s) => moverSet.has(s));
  const pipelineOnTape = pipeline.filter((s) => moverSet.has(s));
  const heldOffTape = held.filter((s) => !moverSet.has(s));

  const summaryLines = [
    input.moversTitle
      ? `Movers «${input.moversTitle}» band ${input.moversBand ?? 'unknown'}`
      : 'Movers seal missing',
    input.sectorTitle
      ? `Sector «${input.sectorTitle}» band ${input.sectorBand ?? 'unknown'}`
      : 'Sector seal missing',
    input.dailyTitle
      ? `Daily ${input.phase} «${input.dailyTitle}» band ${input.dailyBand ?? 'unknown'}`
      : `Daily ${input.phase} seal missing`,
    held.length > 0
      ? `Held on tape: ${heldOnTape.length}/${held.length}`
      : 'No open holdings',
  ];

  const justificationLines = [
    'Deterministic seal + book crosswalk — no model judgment',
    'Symbols listed as orientation only; marks/qty omitted (D-008)',
    `Phase ${input.phase}`,
  ];

  const body = [
    '# Posture synthesis narrative',
    '',
    'Qualitative rollup of sealed posture views plus book/watch overlap with the movers board.',
    'Bands and symbols only — no raw marks or quantities.',
    '',
    '## Movers board',
    '',
    input.moversTitle
      ? `Sealed «${input.moversTitle}» with corroboration band **${input.moversBand ?? 'unknown'}**.`
      : 'Movers board seal not available for this run.',
    movers.length > 0 ? `Leadership symbols (orientation): ${formatList(movers)}.` : '',
    '',
    '## Sector bulletin',
    '',
    input.sectorTitle
      ? `Sealed «${input.sectorTitle}» with corroboration band **${input.sectorBand ?? 'unknown'}**.`
      : 'Sector bulletin seal not available for this run.',
    '',
    '## Daily summary',
    '',
    input.dailyTitle
      ? `Phase **${input.phase}** sealed as «${input.dailyTitle}» (band **${input.dailyBand ?? 'unknown'}**).`
      : `Phase **${input.phase}** daily summary seal not available.`,
    '',
    '## Book vs tape',
    '',
    held.length === 0
      ? 'No open holdings — tape awareness is watchlist/pipeline only.'
      : [
          `Open holdings: ${formatList(held)}.`,
          heldOnTape.length > 0
            ? `Held names also on movers board: ${formatList(heldOnTape)}.`
            : 'No held names appear on the current movers board.',
          heldOffTape.length > 0
            ? `Held names not on movers board: ${formatList(heldOffTape)}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
    '',
    '## Watch & plans',
    '',
    watch.length > 0
      ? `Watchlist symbols: ${formatList(watch)}. On movers board: ${formatList(watchOnTape)}.`
      : 'No active watchlist symbols.',
    pipeline.length > 0
      ? `Pipeline symbols: ${formatList(pipeline)}. On movers board: ${formatList(pipelineOnTape)}.`
      : 'No pipeline leads/trees for this company.',
    '',
    '## Operator note',
    '',
    'Open Market posture Model for stage detail; Sync reloads the hub projection.',
    'Live equity/marks poll separately (D-112). Continuation/exit plans stay in Plans / pipeline stubs.',
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  return { body, summaryLines, justificationLines };
}
