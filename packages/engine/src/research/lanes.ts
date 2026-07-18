import type { QueueClass } from '@hftr/contracts';

/** Topic / library research lane (D-098). Separate from posture and execution. */
export const LIBRARY_RESEARCH_QUEUE: QueueClass = 'LIBRARY_RESEARCH';

/** Market-posture / system-library research lane (D-098). */
export const POSTURE_RESEARCH_QUEUE: QueueClass = 'POSTURE_RESEARCH';

/** Legacy RESEARCH plus the two dedicated research lanes. */
export function isResearchLaneQueue(queueClass: string): boolean {
  return (
    queueClass === 'LIBRARY_RESEARCH' ||
    queueClass === 'POSTURE_RESEARCH' ||
    queueClass === 'RESEARCH'
  );
}

/**
 * Follow-on research pipeline jobs stay on the same research lane as the parent.
 * Legacy RESEARCH parents continue on LIBRARY_RESEARCH.
 */
export function continueResearchLane(parentQueueClass: string): QueueClass {
  if (parentQueueClass === 'POSTURE_RESEARCH') return POSTURE_RESEARCH_QUEUE;
  return LIBRARY_RESEARCH_QUEUE;
}
