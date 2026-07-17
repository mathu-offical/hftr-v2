import {
  LIVE_GATE_IDS,
  type LiveGateChecklistItem,
  type LiveGateEvidence,
  type LiveGateId,
} from '@hftr/contracts';
import { loadLiveGateThresholdBands } from '../limits/catalog-loader';

export const LIVE_GATE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface LiveGateChecklistInput {
  companyId: string;
  nowMs: number;
  brokerConnectionVerified?: boolean;
  brokerEntitlementsValid?: boolean;
  /** Calendar days of paper trading history. */
  paperTradingDays?: number;
  /** Ratio 0–1 of verification pass rate on paper traces. */
  verificationPassRate?: number;
  activeGuardrailPackageIds?: string[];
  /** When operator typed explicit live arm confirmation. */
  liveArmedAtMs?: number | null;
  /** Epoch ms of the evidence bundle being evaluated (defaults to nowMs). */
  evidenceAsOfMs?: number;
}

function item(
  gateId: LiveGateId,
  required: boolean,
  pass: boolean,
  evidence: string,
  requiredAction: string | null = null,
): LiveGateChecklistItem {
  return { gateId, required, pass, evidence, requiredAction };
}

/** Evaluate the live-gate checklist. Fail-closed when evidence missing or stale (>24h). */
export function evaluateLiveGateChecklist(input: LiveGateChecklistInput): LiveGateEvidence {
  const bands = loadLiveGateThresholdBands();
  const paperMaturityDays = bands.boundedRangeFamilies.paper_maturity?.typical ?? 30;
  const passRateThreshold = bands.boundedRangeFamilies.verification_pass_rate?.typical ?? 0.92;
  const evidenceAsOfMs = input.evidenceAsOfMs ?? input.nowMs;
  const ageMs = input.nowMs - evidenceAsOfMs;
  const evidenceFresh = ageMs >= 0 && ageMs <= LIVE_GATE_EVIDENCE_MAX_AGE_MS;

  const checklist: LiveGateChecklistItem[] = [];

  if (input.brokerConnectionVerified === undefined) {
    checklist.push(
      item(
        'broker_connection_verified',
        true,
        false,
        'broker connection verification evidence missing',
        'connect and verify broker credentials',
      ),
    );
  } else {
    checklist.push(
      item(
        'broker_connection_verified',
        true,
        input.brokerConnectionVerified,
        input.brokerConnectionVerified
          ? 'broker connection verified with live handshake'
          : 'broker connection not verified',
        input.brokerConnectionVerified ? null : 'connect and verify broker credentials',
      ),
    );
  }

  if (input.brokerEntitlementsValid === undefined) {
    checklist.push(
      item(
        'broker_entitlements_valid',
        true,
        false,
        'broker entitlement evidence missing',
        'confirm venue entitlements and feed class',
      ),
    );
  } else {
    checklist.push(
      item(
        'broker_entitlements_valid',
        true,
        input.brokerEntitlementsValid,
        input.brokerEntitlementsValid
          ? 'broker entitlements valid for live trading'
          : 'broker entitlements invalid or unconfirmed',
        input.brokerEntitlementsValid ? null : 'resolve entitlement errors in settings',
      ),
    );
  }

  if (input.paperTradingDays === undefined) {
    checklist.push(
      item(
        'paper_maturity_threshold',
        true,
        false,
        'paper maturity evidence missing',
        `accumulate at least ${paperMaturityDays} calendar days of paper history`,
      ),
    );
  } else {
    const pass = input.paperTradingDays >= paperMaturityDays;
    checklist.push(
      item(
        'paper_maturity_threshold',
        true,
        pass,
        pass
          ? `paper history ${input.paperTradingDays} days meets typical threshold ${paperMaturityDays}`
          : `paper history ${input.paperTradingDays} days below typical threshold ${paperMaturityDays}`,
        pass ? null : `continue paper trading until ${paperMaturityDays} days`,
      ),
    );
  }

  if (input.verificationPassRate === undefined) {
    checklist.push(
      item(
        'verification_pass_rate_threshold',
        true,
        false,
        'verification pass-rate evidence missing',
        `achieve verification pass rate ≥ ${passRateThreshold}`,
      ),
    );
  } else {
    const pass = input.verificationPassRate >= passRateThreshold;
    checklist.push(
      item(
        'verification_pass_rate_threshold',
        true,
        pass,
        pass
          ? `verification pass rate ${input.verificationPassRate} meets threshold ${passRateThreshold}`
          : `verification pass rate ${input.verificationPassRate} below threshold ${passRateThreshold}`,
        pass ? null : 'review failed verifications and recovery posture',
      ),
    );
  }

  const guardrailIds = input.activeGuardrailPackageIds;
  if (!guardrailIds || guardrailIds.length === 0) {
    checklist.push(
      item(
        'guardrail_packages_active',
        true,
        false,
        'no active guardrail packages bound',
        'bind guardrail packages to trading modules',
      ),
    );
  } else {
    checklist.push(
      item(
        'guardrail_packages_active',
        true,
        true,
        `active guardrail packages: ${guardrailIds.join(', ')}`,
      ),
    );
  }

  checklist.push(
    item(
      'evidence_freshness',
      true,
      evidenceFresh,
      evidenceFresh
        ? `evidence age ${Math.round(ageMs / 1000)}s within 24h budget`
        : `evidence stale or missing: age ${Math.round(ageMs / 1000)}s exceeds 24h`,
      evidenceFresh ? null : 're-run live gate checklist with fresh evidence',
    ),
  );

  const armed = input.liveArmedAtMs != null && input.liveArmedAtMs > 0;
  checklist.push(
    item(
      'operator_explicit_armed',
      true,
      armed,
      armed
        ? `operator armed live at ${new Date(input.liveArmedAtMs!).toISOString()}`
        : 'live not armed: operator explicit confirmation required',
      armed ? null : 'confirm live arming in settings after all gates pass',
    ),
  );

  const requiredGates = checklist.filter((g) => g.required);
  const overallPass = requiredGates.every((g) => g.pass);

  return {
    schemaVersion: 1,
    companyId: input.companyId,
    mode: 'live',
    catalogVersion: bands.catalogVersion,
    evaluatedAt: new Date(input.nowMs).toISOString(),
    checklist,
    overallPass,
    evidenceAsOfMs,
  };
}

export function liveGateIdsInOrder(): readonly LiveGateId[] {
  return LIVE_GATE_IDS;
}
