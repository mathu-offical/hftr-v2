/**
 * Propose SuggestionThresholdProfile from lane presence (deterministic heuristic).
 * Optional LLM path can replace this when orchestration invoke is available;
 * fail-closed callers always fall back here.
 */
import {
  SuggestionThresholdProfile,
  type SuggestionThresholdProfile as Profile,
  leakLint,
} from '@hftr/contracts';

export type ThresholdLanePresence = {
  hasMarketBars: boolean;
  hasNews: boolean;
  hasMacro: boolean;
  hasFilingsOrWeb: boolean;
  hasLibraryCorpus: boolean;
  domainCount: number;
  sessionPhase?: string;
};

/**
 * Model-free profile proposal from hydrate signals.
 * When many domains are live → tighter drift / dual+ corroboration;
 * sparse entitlement → wider / single floor so search tier still fills.
 */
export function proposeThresholdProfileHeuristic(lanes: ThresholdLanePresence): Profile {
  const rich = lanes.domainCount >= 3 && lanes.hasMarketBars;
  const sparse = lanes.domainCount <= 1;

  const draft = {
    driftFlatPreset: rich ? ('tight' as const) : sparse ? ('wide' as const) : ('typical' as const),
    driftStrongPreset: rich ? ('tight' as const) : ('typical' as const),
    universeCapPreset: sparse ? ('narrow' as const) : rich ? ('broad' as const) : ('typical' as const),
    suggestionCapPreset: rich ? ('typical' as const) : ('narrow' as const),
    libraryFitFloor: lanes.hasLibraryCorpus ? ('medium' as const) : ('low' as const),
    corroborationFloor:
      lanes.domainCount >= 3
        ? ('multi' as const)
        : lanes.domainCount >= 2
          ? ('dual' as const)
          : ('single' as const),
    freshnessPreset: ('default_24h' as const),
    rationaleLines: [
      `Lanes: market=${lanes.hasMarketBars} news=${lanes.hasNews} macro=${lanes.hasMacro} web=${lanes.hasFilingsOrWeb} library=${lanes.hasLibraryCorpus}.`,
      `Domain count ${lanes.domainCount}; session ${lanes.sessionPhase ?? 'unknown'}.`,
      'Profile from deterministic multi-source heuristic (LLM override optional).',
    ],
  };

  const cleaned = {
    ...draft,
    rationaleLines: draft.rationaleLines
      .map((line) => {
        const lint = leakLint(line, []);
        return lint.ok ? line : line.replace(/\d/g, '[n]');
      })
      .slice(0, 8),
  };

  return SuggestionThresholdProfile.parse(cleaned);
}
