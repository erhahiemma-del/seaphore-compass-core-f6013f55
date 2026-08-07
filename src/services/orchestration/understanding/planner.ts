/**
 * Orchestration — dataset and module planning.
 *
 * Decides what the question needs, then checks what the platform can
 * actually serve. The gap between the two is reported as
 * `unavailable`, never quietly closed.
 *
 * ## Availability comes from the registry, not from a list here
 *
 * Which risk modules can run is already recorded in
 * `riskModuleRegistry` — a module knows whether its source is connected
 * and why not. Re-stating that here would create a second answer that
 * drifts from the first.
 */
import { riskModuleRegistry, type RiskModuleRegistry } from "@/services/intelligence";

import type { DatasetId, OfficerIntent, RetrievalPlan, RiskModuleId } from "./types";

/** What each intent wants, before availability is considered. */
const INTENT_DATASETS: Readonly<Record<OfficerIntent, readonly DatasetId[]>> = {
  "fleet-intelligence": ["fleet-positions", "ais-events", "risk-modules"],
  "vessel-investigation": [
    "fleet-positions",
    "ais-events",
    "risk-modules",
    "ownership-registry",
    "sanctions-lists",
    "compliance-records",
    "port-calls",
  ],
  "manifest-intelligence": ["manifests", "port-calls", "revenue-assessments"],
  "cargo-intelligence": ["manifests", "port-calls"],
  "container-intelligence": ["manifests", "port-calls"],
  "ownership-intelligence": ["ownership-registry", "sanctions-lists"],
  "company-intelligence": ["ownership-registry", "sanctions-lists", "fleet-positions"],
  "compliance-intelligence": ["compliance-records", "sanctions-lists", "port-calls"],
  "revenue-intelligence": ["revenue-assessments", "manifests", "port-calls"],
  "port-intelligence": ["port-calls", "fleet-positions", "weather"],
  "voyage-intelligence": ["fleet-positions", "ais-events", "port-calls", "weather"],
  "risk-assessment": ["risk-modules", "ais-events", "sanctions-lists", "compliance-records"],
  "operational-recommendation": ["risk-modules", "fleet-positions", "ais-events"],
  "strategic-summary": ["fleet-positions", "risk-modules", "revenue-assessments"],
  "executive-brief": ["fleet-positions", "ais-events", "risk-modules"],
  "pattern-detection": ["ais-events", "fleet-positions", "risk-modules"],
  "trend-analysis": ["fleet-positions", "port-calls", "revenue-assessments"],
  "historical-replay": ["fleet-positions", "ais-events"],
  comparison: ["fleet-positions", "risk-modules", "ownership-registry"],
  "natural-language-search": ["fleet-positions", "risk-modules"],
  "officer-notes": [],
  "mission-planning": ["fleet-positions", "risk-modules", "weather"],
  unknown: ["fleet-positions"],
};

/**
 * Datasets with no connector wired to them today, and the reason.
 *
 * Each reason was established by inspection or live probing during G5.6
 * and G5.7A, not assumed. `fleet-positions`, `ais-events` and
 * `risk-modules` are absent from this map because they are served.
 */
const DATASET_BLOCKERS: Readonly<Partial<Record<DatasetId, string>>> = {
  "ownership-registry": "OpenCorporates is catalogued at the IAL but not wired to the map.",
  "sanctions-lists": "OpenSanctions, OFAC and UN connectors exist at the IAL but are not wired.",
  "compliance-records": "Equasis is pending terms-of-service verification.",
  "port-calls": "No port-call source is connected.",
  manifests: "No manifest source is connected.",
  "revenue-assessments": "No NIMASA levy source is connected.",
  weather: "NOAA / Open-Meteo is connected at the IAL but not wired to the map.",
};

/** Which risk modules an intent draws on. Empty means "whatever is ready". */
const INTENT_MODULES: Readonly<Partial<Record<OfficerIntent, readonly RiskModuleId[]>>> = {
  "vessel-investigation": [
    "ais-integrity",
    "navigation",
    "ownership",
    "sanctions",
    "compliance",
    "cargo",
    "environmental",
  ],
  "risk-assessment": ["ais-integrity", "navigation", "sanctions", "compliance"],
  "ownership-intelligence": ["ownership", "company-intelligence"],
  "company-intelligence": ["ownership", "company-intelligence", "sanctions"],
  "compliance-intelligence": ["compliance", "sanctions"],
  "revenue-intelligence": ["revenue", "cargo"],
  "cargo-intelligence": ["cargo"],
  "container-intelligence": ["cargo"],
  "manifest-intelligence": ["cargo", "revenue"],
  "voyage-intelligence": ["ais-integrity", "navigation", "environmental"],
  "port-intelligence": ["ais-integrity", "environmental"],
  "pattern-detection": ["ais-integrity", "navigation"],
  "fleet-intelligence": ["ais-integrity"],
  "executive-brief": ["ais-integrity"],
  "operational-recommendation": ["ais-integrity", "sanctions", "compliance"],
  "mission-planning": ["ais-integrity", "environmental"],
};

export interface PlanOptions {
  readonly registry?: RiskModuleRegistry;
}

/**
 * Plan retrieval for an intent.
 *
 * Modules are kept in the plan even when they are `pending-source`: the
 * aggregator runs them anyway and each returns a finding explaining its
 * own absence. Filtering them out here would hide from the officer that
 * the question had a dimension nobody could answer.
 */
export function planRetrieval(intent: OfficerIntent, options: PlanOptions = {}): RetrievalPlan {
  const registry = options.registry ?? riskModuleRegistry;

  const wanted = INTENT_DATASETS[intent];
  const datasets: DatasetId[] = [];
  const unavailable: { dataset: DatasetId; reason: string }[] = [];

  for (const dataset of wanted) {
    const blocker = DATASET_BLOCKERS[dataset];
    if (blocker) unavailable.push({ dataset, reason: blocker });
    else datasets.push(dataset);
  }

  const requested = INTENT_MODULES[intent];
  const registered = new Set(registry.list().map((module) => module.id));
  const modules = (requested ?? [...registered]).filter((id) => registered.has(id));

  return { datasets, modules, unavailable };
}
