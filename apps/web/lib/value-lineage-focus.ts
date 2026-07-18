/**
 * Cross-panel focus: TraceTimeline → RightPanel Values tab lineage.
 * Same CustomEvent pattern as ACTIVITY_REFRESH_EVENT.
 */

export const VALUE_LINEAGE_FOCUS_EVENT = 'hftr:value-lineage-focus';

export type ValueLineageFocusDetail = {
  companyId: string;
  valueRef: string;
};

export function dispatchValueLineageFocus(detail: ValueLineageFocusDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VALUE_LINEAGE_FOCUS_EVENT, { detail }));
}
