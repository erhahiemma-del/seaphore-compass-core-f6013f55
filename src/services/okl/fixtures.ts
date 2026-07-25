/**
 * Fixtures for demoing the Operational Knowledge Layer without touching
 * live connectors. Produces a small deterministic UIP + evidence set +
 * historical hints so the OKL surface is populated on first render.
 *
 * The OKL still consumes ONLY the UIP and (optionally) the MKG — this
 * fixture just provides those inputs offline.
 */
import type { NormalizedEvidence, CanonicalEntityRef } from "@/services/ial/types";
import type {
  FusedEntityRecord,
  FusedEvidencePackage,
} from "@/services/ife/types";
import type { UnifiedIntelligencePackage } from "@/services/ife";
import type { IdentityCluster } from "@/services/ife";
import type { OklHistoricalHint, OklInvestigationHint } from "@/services/okl";

const ISO_NOW = new Date().toISOString();

const vesselA: CanonicalEntityRef = {
  kind: "vessel",
  id: "vessel:imo:9438291",
  label: "DONGWON NO.16",
};
const vesselB: CanonicalEntityRef = {
  kind: "vessel",
  id: "vessel:imo:9701234",
  label: "MV KOKO STAR",
};
const companyA: CanonicalEntityRef = {
  kind: "company",
  id: "company:cac:RC-88234",
  label: "Blue Horizon Maritime Ltd",
};
const companyB: CanonicalEntityRef = {
  kind: "company",
  id: "company:cac:RC-11901",
  label: "Skyline Shipping Nigeria Ltd",
};
const portLagos: CanonicalEntityRef = {
  kind: "port",
  id: "port:unlocode:NGLOS",
  label: "Lagos (Apapa)",
};

function ev(
  id: string,
  source: string,
  sourceName: string,
  entity: CanonicalEntityRef,
  kind: NormalizedEvidence["kind"],
  fields: Record<string, NormalizedEvidence["fields"][string]>,
  excerpt?: string,
): NormalizedEvidence {
  return {
    id,
    source,
    sourceName,
    grade: "CORROBORATED",
    entity,
    kind,
    fields,
    observedAt: ISO_NOW,
    retrievedAt: ISO_NOW,
    freshnessSeconds: 3_600,
    hash: id,
    providerRecordId: id,
    excerpt,
  };
}

const evidence: NormalizedEvidence[] = [
  ev("ev-gfw-1", "gfw", "Global Fishing Watch", vesselA, "position", {
    port: "IR-BANDAR",
    destination: "Bandar Abbas",
    deviationKm: 480,
  }, "Route deviation noted through Strait of Hormuz."),
  ev("ev-ais-1", "ais", "Terrestrial AIS", vesselA, "voyage", {
    port: "SY-LAT",
    destination: "Latakia",
  }),
  ev("ev-open-1", "opensanctions", "OpenSanctions", vesselA, "sanctions", {
    status: "match",
    score: 82,
    program: "OFAC-SDN",
  }),
  ev("ev-cargo-1", "customs", "Customs Manifest", vesselA, "cargo", {
    declaredWeightTonnes: 12_000,
    observedWeightTonnes: 15_400,
    declaredValueUsd: 4_500_000,
    marketValueUsd: 6_800_000,
  }),
  ev("ev-portcall-1", "portauth", "Port Authority", portLagos, "port-call", {
    port: "Lagos (Apapa)",
    waitHours: 42,
  }),
  ev("ev-portcall-2", "portauth", "Port Authority", portLagos, "port-call", {
    port: "Lagos (Apapa)",
    waitHours: 36,
  }),
  ev("ev-portcall-3", "portauth", "Port Authority", portLagos, "port-call", {
    port: "Lagos (Apapa)",
    waitHours: 51,
  }),
  ev("ev-portcall-4", "portauth", "Port Authority", portLagos, "port-call", {
    port: "Lagos (Apapa)",
    waitHours: 28,
  }),
  ev("ev-portcall-5", "portauth", "Port Authority", portLagos, "port-call", {
    port: "Lagos (Apapa)",
    waitHours: 44,
  }),
  ev("ev-own-a", "cac", "CAC Nigeria", companyA, "ownership", {
    beneficialOwner: "Ada Onyeka",
    parent: "Blue Horizon Holdings",
  }),
  ev("ev-own-b", "cac", "CAC Nigeria", companyB, "ownership", {
    beneficialOwner: "Ada Onyeka",
    parent: "Blue Horizon Holdings",
  }),
];

function fusedRecord(entity: CanonicalEntityRef): FusedEntityRecord {
  return {
    entity,
    fields: [],
    confidence: "HIGH",
    grade: "CORROBORATED",
    sources: ["gfw", "opensanctions", "customs"],
    explanation:
      "Cross-connector agreement on core identifiers and status attributes.",
  };
}

const fused: FusedEvidencePackage = {
  id: "fused_demo_okl_001",
  createdAt: ISO_NOW,
  sourcePackageId: "pkg_demo_okl_001",
  canonical: [
    fusedRecord(vesselA),
    fusedRecord(vesselB),
    fusedRecord(companyA),
    fusedRecord(companyB),
    fusedRecord(portLagos),
  ],
  contradictions: [
    {
      entity: vesselA,
      field: "voyage.destination",
      severity: "critical",
      values: [
        {
          value: "Bandar Abbas",
          source: "gfw",
          grade: "CORROBORATED",
          evidenceId: "ev-gfw-1",
          observedAt: ISO_NOW,
          accepted: true,
        },
        {
          value: "Latakia",
          source: "ais",
          grade: "OBSERVED",
          evidenceId: "ev-ais-1",
          observedAt: ISO_NOW,
          accepted: false,
        },
      ],
      resolution: "highest-authority",
      explanation: "Two independent connectors disagree on next port of call.",
    },
  ],
  sources: [
    { connectorId: "gfw", sourceName: "Global Fishing Watch", grade: "CORROBORATED", agreementScore: 0.85, weight: 1 },
    { connectorId: "ais", sourceName: "Terrestrial AIS", grade: "OBSERVED", agreementScore: 0.7, weight: 0.9 },
    { connectorId: "opensanctions", sourceName: "OpenSanctions", grade: "VERIFIED", agreementScore: 0.95, weight: 1 },
    { connectorId: "customs", sourceName: "Customs Manifest", grade: "REPORTED", agreementScore: 0.6, weight: 0.9 },
    { connectorId: "portauth", sourceName: "Port Authority", grade: "REPORTED", agreementScore: 0.7, weight: 0.9 },
    { connectorId: "cac", sourceName: "CAC Nigeria", grade: "VERIFIED", agreementScore: 0.9, weight: 1 },
  ],
  report: {
    contradictions: [],
    evidenceStrength: "HIGH",
    missing: [],
    unknowns: [],
  } as unknown as FusedEvidencePackage["report"],
  missing: [],
  confidence: "HIGH",
  grade: "CORROBORATED",
  stats: {
    inputRecords: evidence.length,
    canonicalEntities: 5,
    contradictions: 1,
    sourcesQueried: 6,
    sourcesResponded: 6,
    averageFreshnessSeconds: 3_600,
  },
};

const identity: IdentityCluster[] = [
  { canonicalId: vesselA.id, aliasIds: [vesselA.id, "vessel:mmsi:440123456", "vessel:name:DONGWON16"], score: 92, rationale: "IMO + MMSI + name agreement", resolvedAt: ISO_NOW } as unknown as IdentityCluster,
];

export const DEMO_UIP: UnifiedIntelligencePackage = {
  id: "uip_demo_okl_001",
  createdAt: ISO_NOW,
  fused,
  identity,
  osae: [],
  provenance: fused.sources.map((s) => ({
    connectorId: s.connectorId,
    sourceName: s.sourceName,
    records: 2,
    agreementScore: s.agreementScore,
  })),
  freshestSeconds: 3_600,
  hasContradictions: true,
};

export const DEMO_EVIDENCE = evidence;

export const DEMO_HISTORICAL: OklHistoricalHint[] = [
  { entityId: vesselA.id, patternKind: "AIS_DARK_PATTERN", count: 3, lastSeen: "2026-05-11T00:00:00Z" },
  { entityId: vesselA.id, patternKind: "SUSPICIOUS_ROUTING", count: 2, lastSeen: "2026-06-14T00:00:00Z" },
  { entityId: vesselA.id, patternKind: "COMPLIANCE_VIOLATION", count: 2, lastSeen: "2026-07-01T00:00:00Z" },
];

export const DEMO_INVESTIGATIONS: OklInvestigationHint[] = [
  { investigationId: "INV-2026-014", entityIds: [vesselA.id, companyA.id] },
  { investigationId: "INV-2026-021", entityIds: [vesselA.id, companyB.id] },
];
