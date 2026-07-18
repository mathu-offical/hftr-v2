/**
 * Librarian qualitative overlap — re-export shared contracts path (LLM-assist normalize + Jaccard).
 * Call sites stay on `@hftr/engine` for research handlers; galaxy UI imports contracts via layout helpers.
 */
export {
  tokenizeQualitativeText,
  tokenOverlapRatio,
  overlapToRelevanceBand,
  scoreRelevanceBand,
  titleSimilarity,
  similarityBandBetweenTexts,
  type RelevanceBand,
} from '@hftr/contracts';
