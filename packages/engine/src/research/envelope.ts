import { HandoffEnvelope, type QueueClass } from '@hftr/contracts';

export function buildResearchEnvelope(opts: {
  companyId: string;
  moduleId: string | null;
  idempotencyKey: string;
  queueClass?: QueueClass;
  causationRefs?: string[];
}): HandoffEnvelope {
  return HandoffEnvelope.parse({
    contractVersion: '1',
    producerRunId: null,
    companyId: opts.companyId,
    moduleId: opts.moduleId,
    authorityClass: 'DETERMINISTIC',
    mutationClass: 'IMMUTABLE',
    queueClass: opts.queueClass ?? 'RESEARCH',
    priorityBand: 'NORMAL',
    timeoutClass: 'MEDIUM',
    idempotencyKey: opts.idempotencyKey,
    replayHash: null,
    controlSnapshotRef: null,
    causationRefs: opts.causationRefs ?? [],
    expiresAt: null,
  });
}
