/**
 * OIE — public entry point.
 *
 * Consumers should ONLY import from `@/services/oie`. Everything else
 * (individual modules, provider runtimes) is an implementation detail.
 */
export { runOIE } from "./engine";
export { interpretQuery } from "./query-interpreter";
export { planSkills, planCapabilities } from "./planner";
export { SKILLS } from "./skills-registry";
export {
  PROVIDERS,
  DEFAULT_PROVIDER_ID,
  getProviderMeta,
  type ReasoningProviderId,
  type ReasoningProviderMeta,
} from "./reasoning-provider";
export type {
  HumanResponse,
  ConfidenceBadge,
  InterpretedQuery,
  OperationalDomain,
  OperationalMission,
  OperationalPlan,
  OperationalSkill,
  OIERequest,
  OIEResult,
} from "./types";
