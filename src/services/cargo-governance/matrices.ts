/**
 * Trust Classification Matrix & Provider Priority Matrix (GOV-02).
 *
 * Both matrices are derived from the National Maritime Data Source Registry —
 * they never carry independent facts, so the registry stays the single source
 * of truth for source governance.
 */
import { NATIONAL_MARITIME_DATA_SOURCES } from "./source-registry";
import type {
  CargoEvidenceAxis,
  DataSourceRecord,
  Priority,
  SourceClass,
  TrustLevel,
} from "./types";

/** Evidence weight ceiling per trust level — what a source may ever count for. */
export const TRUST_WEIGHT: Readonly<Record<TrustLevel, number>> = {
  AUTHORITY_OF_RECORD: 1,
  REGULATORY: 0.9,
  VERIFIED_COMMERCIAL: 0.75,
  AGGREGATED: 0.6,
  OPEN_SOURCE: 0.45,
  DERIVED_ANALYTIC: 0.4,
};

export interface TrustClassificationRow {
  readonly trustLevel: TrustLevel;
  readonly weight: number;
  readonly sourceClasses: ReadonlyArray<SourceClass>;
  readonly sources: ReadonlyArray<string>;
  readonly usageRule: string;
}

const USAGE_RULE: Readonly<Record<TrustLevel, string>> = {
  AUTHORITY_OF_RECORD:
    "May stand alone as the basis for an officer decision. Contradictions against it must be surfaced, not silently resolved.",
  REGULATORY:
    "May anchor identity and compliance findings. Requires an authority-of-record record before revenue action.",
  VERIFIED_COMMERCIAL:
    "May corroborate authoritative evidence. Never the sole basis for enforcement or revenue action.",
  AGGREGATED:
    "Context and pattern only. Always labelled as aggregated with its retrieval date.",
  OPEN_SOURCE: "Lead generation only. Requires independent corroboration before projection as fact.",
  DERIVED_ANALYTIC:
    "Always labelled INFERRED. Raises questions; never answers them on its own.",
};

export function trustClassificationMatrix(): ReadonlyArray<TrustClassificationRow> {
  const levels = Object.keys(TRUST_WEIGHT) as TrustLevel[];
  return levels.map((trustLevel) => {
    const sources = NATIONAL_MARITIME_DATA_SOURCES.filter((s) => s.trustLevel === trustLevel);
    return {
      trustLevel,
      weight: TRUST_WEIGHT[trustLevel],
      sourceClasses: Array.from(new Set(sources.map((s) => s.sourceClass))),
      sources: sources.map((s) => s.name),
      usageRule: USAGE_RULE[trustLevel],
    };
  });
}

export interface ProviderPriorityRow {
  readonly priority: Priority;
  readonly intent: string;
  readonly sources: ReadonlyArray<Pick<DataSourceRecord, "id" | "name" | "integrationStatus">>;
}

const PRIORITY_INTENT: Readonly<Record<Priority, string>> = {
  P0: "Mandatory for a defensible national cargo picture. Integrate first.",
  P1: "High-value corroboration. Integrate once every P0 source is live.",
  P2: "Breadth and redundancy. Integrate opportunistically.",
  P3: "Optional enrichment. Integrate only on a named officer requirement.",
};

export function providerPriorityMatrix(): ReadonlyArray<ProviderPriorityRow> {
  const priorities: Priority[] = ["P0", "P1", "P2", "P3"];
  return priorities.map((priority) => ({
    priority,
    intent: PRIORITY_INTENT[priority],
    sources: NATIONAL_MARITIME_DATA_SOURCES.filter((s) => s.priority === priority).map((s) => ({
      id: s.id,
      name: s.name,
      integrationStatus: s.integrationStatus,
    })),
  }));
}

/**
 * Which registry sources can feed each cargo confidence axis. Governance
 * mapping only — provider selection at runtime remains the Provider
 * Resolver's job and is untouched by this sprint.
 */
export const AXIS_SOURCE_MAP: Readonly<Record<CargoEvidenceAxis, ReadonlyArray<string>>> = {
  government_declaration: ["ncs-declarations"],
  nimasa_return: ["nimasa-returns"],
  bill_of_lading: ["importgenius", "volza", "trademo"],
  ais_voyage: ["marinetraffic", "datalastic"],
  company_verification: ["opencorporates", "equasis", "imo-gisis"],
  revenue_assessment: ["ncs-declarations", "nimasa-returns"],
  sanctions: ["ofac", "un-security-council"],
  supporting_intelligence: ["global-fishing-watch"],
};
