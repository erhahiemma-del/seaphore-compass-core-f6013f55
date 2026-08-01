/**
 * Sprint 5 mock dataset — Layer 2.8 Intelligence Contract shapes.
 * Deterministic fixtures for entity / relationship / evidence / investigation /
 * session / briefing responses. No DB reads; swap for repositories in Sprint 6.
 */

export type EvidenceGrade =
  | "verified"
  | "corroborated"
  | "observed"
  | "reported"
  | "inferred"
  | "unconfirmed";

export interface MockEntity {
  id: string;
  type: "vessel" | "company" | "person" | "port" | "document" | "event" | "investigation";
  displayName: string;
  attributes: Record<string, unknown>;
  relationshipIds: string[];
  evidenceIds: string[];
}

export interface MockRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  status: "verified" | "pending" | "rejected";
  confidence: EvidenceGrade;
  evidenceIds: string[];
  validFrom: string;
  validTo: string | null;
}

export interface MockEvidence {
  id: string;
  sourceSystem: string;
  contentHash: string;
  grade: EvidenceGrade;
  provenance: {
    collectedAt: string;
    collectedBy: string;
    chainOfCustody: Array<{ actor: string; action: string; timestamp: string }>;
  };
  versionHistory: Array<{ version: number; timestamp: string; summary: string }>;
  payload: Record<string, unknown>;
}

export interface MockInvestigation {
  id: string;
  code: string;
  title: string;
  status: "open" | "closed" | "archived";
  leadOfficerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  linkedEntityIds: string[];
}

export interface MockSession {
  id: string;
  userId: string;
  investigationId: string | null;
  startedAt: string;
  endedAt: string | null;
  interactions: number;
}

export interface MockBriefing {
  id: string;
  query: string;
  generatedAt: string;
  executiveAssessment: { summary: string; grade: EvidenceGrade };
  analyticalAssessment: { reasoning: string[]; grade: EvidenceGrade };
  evidence: MockEvidence[];
  entities: Array<Pick<MockEntity, "id" | "type" | "displayName">>;
  patterns: Array<{ id: string; label: string; grade: EvidenceGrade; description: string }>;
  decisionImpact: { options: string[]; recommendation: string };
  officerActions: { locked: boolean; available: string[] };
}

// ── canonical scenario (matches Sprint 4 seed) ─────────────────────────────
const VESSEL: MockEntity = {
  id: "ent_vessel_9837456",
  type: "vessel",
  displayName: "MV Crimson Endeavour",
  attributes: { imo: "9837456", flag: "LR", grossTonnage: 42_100 },
  relationshipIds: ["rel_operates_001", "rel_docked_001", "rel_bo_pending"],
  evidenceIds: ["evd_ais_001"],
};

const COMPANY: MockEntity = {
  id: "ent_company_oceanic",
  type: "company",
  displayName: "Oceanic Lines Ltd",
  attributes: { jurisdiction: "LR", registryNo: "OL-88213" },
  relationshipIds: ["rel_operates_001", "rel_bo_pending"],
  evidenceIds: [],
};

const PORT: MockEntity = {
  id: "ent_port_apapa",
  type: "port",
  displayName: "Apapa Anchorage, Lagos",
  attributes: { unlocode: "NGAPP", country: "NG" },
  relationshipIds: ["rel_docked_001"],
  evidenceIds: [],
};

const INVESTIGATION: MockInvestigation = {
  id: "inv_2026_00431",
  code: "INV-2026-00431",
  title: "Ownership review — MV Crimson Endeavour",
  status: "open",
  leadOfficerId: "usr_officer_01",
  createdAt: "2026-05-14T08:20:00Z",
  updatedAt: "2026-07-18T11:02:00Z",
  deletedAt: null,
  linkedEntityIds: [VESSEL.id, COMPANY.id, PORT.id],
};

const REL_OPERATES: MockRelationship = {
  id: "rel_operates_001",
  fromEntityId: COMPANY.id,
  toEntityId: VESSEL.id,
  type: "OPERATES",
  status: "verified",
  confidence: "verified",
  evidenceIds: ["evd_ais_001"],
  validFrom: "2024-11-02T00:00:00Z",
  validTo: null,
};

const REL_DOCKED: MockRelationship = {
  id: "rel_docked_001",
  fromEntityId: VESSEL.id,
  toEntityId: PORT.id,
  type: "DOCKED_AT",
  status: "verified",
  confidence: "observed",
  evidenceIds: ["evd_ais_001"],
  validFrom: "2026-07-15T04:12:00Z",
  validTo: "2026-07-17T22:40:00Z",
};

const REL_BO_PENDING: MockRelationship = {
  id: "rel_bo_pending",
  fromEntityId: COMPANY.id,
  toEntityId: VESSEL.id,
  type: "BENEFICIAL_OWNER_OF",
  status: "pending",
  confidence: "inferred",
  evidenceIds: [],
  validFrom: "2026-07-01T00:00:00Z",
  validTo: null,
};

const EVIDENCE_AIS: MockEvidence = {
  id: "evd_ais_001",
  sourceSystem: "AIS_STREAM",
  contentHash: "sha256:9f3c…c2e1",
  grade: "verified",
  provenance: {
    collectedAt: "2026-07-15T04:12:00Z",
    collectedBy: "adapter:ais-stream",
    chainOfCustody: [
      { actor: "adapter:ais-stream", action: "INGEST", timestamp: "2026-07-15T04:12:03Z" },
      { actor: "system:hash-verify", action: "VERIFY", timestamp: "2026-07-15T04:12:05Z" },
    ],
  },
  versionHistory: [{ version: 1, timestamp: "2026-07-15T04:12:03Z", summary: "Initial ingest" }],
  payload: {
    mmsi: "636023456",
    lat: 6.4372,
    lon: 3.3894,
    speedKn: 0.2,
  },
};

const SESSION: MockSession = {
  id: "ses_9c17ab",
  userId: "usr_officer_01",
  investigationId: INVESTIGATION.id,
  startedAt: "2026-07-20T09:00:00Z",
  endedAt: null,
  interactions: 14,
};

const ENTITIES: Record<string, MockEntity> = {
  [VESSEL.id]: VESSEL,
  [COMPANY.id]: COMPANY,
  [PORT.id]: PORT,
};

const RELATIONSHIPS: Record<string, MockRelationship> = {
  [REL_OPERATES.id]: REL_OPERATES,
  [REL_DOCKED.id]: REL_DOCKED,
  [REL_BO_PENDING.id]: REL_BO_PENDING,
};

const EVIDENCE: Record<string, MockEvidence> = {
  [EVIDENCE_AIS.id]: EVIDENCE_AIS,
};

const INVESTIGATIONS: Record<string, MockInvestigation> = {
  [INVESTIGATION.id]: INVESTIGATION,
};

const SESSIONS: Record<string, MockSession> = { [SESSION.id]: SESSION };

export const mockDb = {
  entity: (id: string) => ENTITIES[id] ?? null,
  relationship: (id: string) => RELATIONSHIPS[id] ?? null,
  evidence: (id: string) => EVIDENCE[id] ?? null,
  investigation: (id: string) => INVESTIGATIONS[id] ?? null,
  session: (id: string) => SESSIONS[id] ?? null,
  entityWithGraph(id: string) {
    const entity = ENTITIES[id];
    if (!entity) return null;
    return {
      ...entity,
      relationships: entity.relationshipIds.map((rid) => RELATIONSHIPS[rid]).filter(Boolean),
      evidence: entity.evidenceIds.map((eid) => EVIDENCE[eid]).filter(Boolean),
    };
  },
  buildBriefing(query: string): MockBriefing {
    return {
      id: `brf_${crypto.randomUUID()}`,
      query,
      generatedAt: new Date().toISOString(),
      executiveAssessment: {
        summary:
          "MV Crimson Endeavour is presently operated by Oceanic Lines Ltd and last observed docked at Apapa Anchorage. One beneficial-owner candidate remains pending officer review.",
        grade: "verified",
      },
      analyticalAssessment: {
        reasoning: [
          "AIS payload (evd_ais_001) places vessel at Apapa 2026-07-15 → 2026-07-17.",
          "Operator relationship verified against Liberian registry filing.",
          "Beneficial-owner link is inferred from corporate disclosures; not yet corroborated.",
        ],
        grade: "corroborated",
      },
      evidence: [EVIDENCE_AIS],
      entities: [
        { id: VESSEL.id, type: VESSEL.type, displayName: VESSEL.displayName },
        { id: COMPANY.id, type: COMPANY.type, displayName: COMPANY.displayName },
        { id: PORT.id, type: PORT.type, displayName: PORT.displayName },
      ],
      patterns: [
        {
          id: "pat_dwell_apapa",
          label: "Extended dwell at Apapa",
          grade: "observed",
          description: "Dwell time > 48h without cargo manifest update.",
        },
      ],
      decisionImpact: {
        options: [
          "Escalate ownership review to Compliance Centre",
          "Request corroborating filings from LR registry",
          "Dismiss — no anomaly",
        ],
        recommendation: "Escalate ownership review to Compliance Centre",
      },
      officerActions: {
        locked: true,
        available: ["AGREE", "DISAGREE", "MODIFY", "DISMISS"],
      },
    };
  },
};
