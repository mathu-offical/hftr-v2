/**
 * D-189: clone parent execution envelope onto linked simulation ENGINEs when
 * `setup_snapshot.simulationBinding.mimicParent` is true.
 */
import type { EngineSetupSnapshot } from './engines';
import type { ModuleType } from './modules';
import type { SimulationEngineBinding } from './paper-engine';

export type MimicParentModuleSeed = {
  type: ModuleType;
  config: Record<string, unknown>;
};

export type MimicParentSource = {
  setupSnapshot: EngineSetupSnapshot;
  modules: readonly MimicParentModuleSeed[];
};

export function shouldApplyMimicParent(
  binding: SimulationEngineBinding | undefined,
): binding is SimulationEngineBinding {
  return binding?.mimicParent === true && binding.role !== 'adhoc';
}

/** Overlay parent engine setup snapshot fields onto the child draft. */
export function mimicParentEngineSetup(
  parent: MimicParentSource,
  childSetup: EngineSetupSnapshot,
): EngineSetupSnapshot {
  const parentSetup = parent.setupSnapshot;
  return {
    ...childSetup,
    topicSectors:
      parentSetup.topicSectors.length > 0
        ? [...parentSetup.topicSectors]
        : childSetup.topicSectors,
    allocationMode: parentSetup.allocationValue
      ? parentSetup.allocationMode
      : childSetup.allocationMode,
    allocationValue: parentSetup.allocationValue || childSetup.allocationValue,
    targetExitLocal: parentSetup.targetExitLocal || childSetup.targetExitLocal,
  };
}

/** Copy trading strategyFamilies and policy envelope ref from parent modules. */
export function mimicParentModuleConfigs(
  parentModules: readonly MimicParentModuleSeed[],
  childModules: readonly MimicParentModuleSeed[],
): MimicParentModuleSeed[] {
  const parentTrading = parentModules.find((module) => module.type === 'trading');
  const parentPolicy = parentModules.find((module) => module.type === 'policy');

  return childModules.map((child) => {
    const config = { ...child.config };
    if (child.type === 'trading' && parentTrading?.config) {
      const families = parentTrading.config.strategyFamilies;
      if (Array.isArray(families)) {
        config.strategyFamilies = [...families];
      }
      const subtype = parentTrading.config.subtype;
      if (typeof subtype === 'string' && subtype.length > 0) {
        config.subtype = subtype;
      }
    }
    if (child.type === 'policy' && parentPolicy?.config) {
      const ref = parentPolicy.config.policyEnvelopeRef;
      if (typeof ref === 'string' && ref.length > 0) {
        config.policyEnvelopeRef = ref;
      }
    }
    return { ...child, config };
  });
}
