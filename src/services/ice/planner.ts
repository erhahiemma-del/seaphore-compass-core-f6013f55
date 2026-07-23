/**
 * ICE-1 · Source Planner.
 *
 * Chooses which IAL connectors to invoke for a query. Reuses the IAL
 * connector list — we do not maintain our own. The planner rules are
 * deterministic and auditable, not learned:
 *
 *   • FACT_LOOKUP / IDENTITY  → registry sources (IMO GISIS, Equasis)
 *   • INVESTIGATION           → all available connectors
 *   • OWNERSHIP_TRACE         → registry + sanctions + trade atlas
 *   • SANCTIONS_SCREEN        → OpenSanctions + Equasis (+ Lloyd's on T3)
 *   • VOYAGE_ANALYSIS         → AIS, MarineTraffic, Customs
 *   • COMPLIANCE_CHECK        → Equasis, NIMASA, Lloyd's
 *
 * Lloyd's List is skipped below risk tier T3 (spec acceptance criterion).
 */

import type { ConnectorId } from "@/services/ial/types";
import type { Intent, IceQueryInput, QueryPlan, RiskTier } from "./types";
import { classifyIntent } from "./intent";

const ALL_SOURCES: ReadonlyArray<ConnectorId> = [
  "imo-gisis","equasis","marinetraffic","ais","opensanctions",
  "customs","nimasa","noaa","gfw","trade-atlas","lloyds-list",
];

const INTENT_SOURCES: Readonly<Record<Intent, ConnectorId[]>> = {
  FACT_LOOKUP:      ["imo-gisis","equasis"],
  INVESTIGATION:    [...ALL_SOURCES],
  OWNERSHIP_TRACE:  ["imo-gisis","equasis","opensanctions","trade-atlas","lloyds-list"],
  SANCTIONS_SCREEN: ["opensanctions","equasis","lloyds-list"],
  VOYAGE_ANALYSIS:  ["ais","marinetraffic","customs","noaa"],
  COMPLIANCE_CHECK: ["equasis","nimasa","lloyds-list","imo-gisis"],
  OTHER:            ["imo-gisis","equasis","marinetraffic"],
};

export function planQuery(
  input: IceQueryInput,
  availableConnectors: ReadonlyArray<ConnectorId>,
): QueryPlan {
  const intent = classifyIntent(input.text);
  const riskTier: RiskTier = input.riskTier ?? defaultRiskTier(intent);

  const desired = INTENT_SOURCES[intent] ?? INTENT_SOURCES.OTHER;
  const selected: ConnectorId[] = [];
  const skipped: { source: ConnectorId; reason: string }[] = [];

  for (const source of ALL_SOURCES) {
    const wanted = desired.includes(source);
    const registered = availableConnectors.includes(source);

    if (!wanted) {
      skipped.push({ source, reason: `Not required for intent ${intent}` });
      continue;
    }
    if (!registered) {
      skipped.push({ source, reason: "Connector not registered in this environment" });
      continue;
    }
    if (source === "lloyds-list" && riskTierRank(riskTier) < riskTierRank("T3")) {
      skipped.push({ source, reason: "Risk score below T3 threshold" });
      continue;
    }
    selected.push(source);
  }

  return {
    queryId: crypto.randomUUID(),
    text: input.text,
    intent,
    entity: input.entity,
    riskTier,
    selected,
    skipped,
  };
}

function defaultRiskTier(intent: Intent): RiskTier {
  if (intent === "SANCTIONS_SCREEN" || intent === "INVESTIGATION") return "T3";
  if (intent === "OWNERSHIP_TRACE" || intent === "COMPLIANCE_CHECK") return "T2";
  if (intent === "VOYAGE_ANALYSIS") return "T1";
  return "T0";
}

function riskTierRank(t: RiskTier): number {
  return { T0: 0, T1: 1, T2: 2, T3: 3 }[t];
}
