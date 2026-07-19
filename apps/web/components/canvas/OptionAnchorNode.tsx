'use client';

/**
 * @deprecated Import from `./DecisionNode` (D-192 unified decision nodes).
 * Re-exports kept so existing CompanyCanvas imports keep working during transition.
 */
export {
  DecisionNode,
  OptionAnchorNode,
  OPTION_ANCHOR_HANDLE_IN,
  OPTION_ANCHOR_HANDLE_OUT,
  type DecisionFlowNode,
  type DecisionNodeData,
  type OptionAnchorFlowNode,
  type OptionAnchorNodeData,
} from './DecisionNode';
