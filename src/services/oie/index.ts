/**
 * OIE — public entry point (client-safe).
 *
 * Consumers should ONLY import from `@/services/oie`. Server-only
 * modules such as `provider-runtime.server.ts` are NEVER re-exported
 * here to keep the browser bundle clean.
 */
export { runOIE, type ProviderCall, type ProviderInvocationResult } from "./engine";
export { interpretQuery, containsPronounReference } from "./query-interpreter";
export { resolvePronouns, findAnchor, isBareSkillPick } from "./conversation-resolver";
export { planSkills, planCapabilities } from "./planner";
export { SKILLS, findSkill, skillForIntent } from "./skills-registry";
export { needsClarification, buildClarification } from "./clarifier";
export { buildHumanResponse } from "./response-generator";
export { badgeFromComposite, explainMatrix } from "./decision-support";
export {
  PROVIDERS,
  DEFAULT_PROVIDER_ID,
  getProviderMeta,
  type ReasoningProviderId,
  type ReasoningProviderMeta,
} from "./reasoning-provider";
export type {
  Clarification,
  ConfidenceBadge,
  EntityMention,
  EntityKind,
  HumanResponse,
  InterpretedQuery,
  MissionConversationTurn,
  OperationalDomain,
  OperationalIntent,
  OperationalMission,
  OperationalPlan,
  OperationalSkill,
  OIERequest,
  OIEResult,
} from "./types";
