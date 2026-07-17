/**
 * Deterministic mock intelligence dataset.
 *
 * Every Copilot draws from this dataset when no live model call is made
 * (or as retrieval context when one is). Responses derived here are
 * evidence-tagged so the UI can always render provenance (HR-11).
 */
import type {
  CopilotEvidence,
  CopilotHistoricalMatch,
  CopilotInstanceKey,
  CopilotObservation,
  CopilotRecommendation,
  CopilotRelatedInvestigation,
} from "./types";

interface DomainBundle {
  observations: CopilotObservation[];
  recommendations: CopilotRecommendation[];
  historical: CopilotHistoricalMatch[];
  related: CopilotRelatedInvestigation[];
}

const ev = (
  id: string,
  label: string,
  source: string,
  confidence: CopilotEvidence["confidence"] = "observed",
  entityRef?: string,
): CopilotEvidence => ({ id, label, source, confidence, entityRef });

export const MOCK_INTELLIGENCE: Record<CopilotInstanceKey, DomainBundle> = {
  seaphore: {
    observations: [
      {
        id: "obs-inv-1",
        text: "Ownership graph shows Oceanic Lines Ltd. and Bluewave Holdings sharing three directors observed across four voyages in the last 90 days.",
        confidence: "inferred",
        evidence: [
          ev("e1", "Corporate Registry (CAC)", "CAC", "verified", "COMP-OCE-01"),
          ev("e2", "Voyage log VOY-2411-A", "Seaphore Case DB", "observed", "VOY-2411-A"),
        ],
      },
      {
        id: "obs-inv-2",
        text: "AIS trace on MV Ocean Pearl shows a 6h dark period observed south-west of Bonny Terminal on 12 Jul.",
        confidence: "observed",
        evidence: [
          ev("e3", "AIS feed (MarineTraffic)", "AIS", "observed", "IMO:9412345"),
        ],
      },
    ],
    recommendations: [
      {
        id: "rec-inv-1",
        action: "Open investigation on shared-director cluster (Oceanic × Bluewave)",
        rationale: "Three directors are shared across two entities linked to four flagged voyages.",
        risk: "MEDIUM",
        confidence: "inferred",
        route: "/investigate",
        evidence: [ev("e1", "CAC Registry", "CAC", "verified")],
      },
    ],
    historical: [
      {
        id: "h1",
        caseRef: "CASE-2024-118",
        summary: "Shared-director cluster with STS transfers off Bonny.",
        matchPct: 82,
        outcome: "Escalated · ₦640M recovered",
        route: "/memory",
      },
    ],
    related: [
      { id: "r1", ref: "INV-8821", title: "MV Ocean Pearl — AIS gap", status: "Open", route: "/investigate/INV-8821" },
      { id: "r2", ref: "INV-8760", title: "Oceanic Lines — ownership review", status: "Escalated", route: "/investigate/INV-8760" },
    ],
  },
  manifest: {
    observations: [
      {
        id: "obs-man-1",
        text: "5 manifests observed with duplicate BOL numbers within the last 24 hours, concentrated at Apapa (3) and Tin Can (2).",
        confidence: "verified",
        evidence: [ev("e1", "Customs Manifest DB", "NCS", "verified")],
      },
      {
        id: "obs-man-2",
        text: "Declared HS 2710 (petroleum) volume inferred to under-run observed vessel draft by ~14% on VOY-2419-B.",
        confidence: "inferred",
        evidence: [
          ev("e2", "Manifest MFT-77321", "NCS", "verified"),
          ev("e3", "AIS draft telemetry", "AIS", "observed"),
        ],
      },
    ],
    recommendations: [
      {
        id: "rec-man-1",
        action: "Route 5 duplicate manifests to Verification queue",
        rationale: "Duplicate BOL numbers observed on same 24h window.",
        risk: "HIGH",
        confidence: "verified",
        route: "/manifest",
        evidence: [ev("e1", "Customs Manifest DB", "NCS", "verified")],
      },
      {
        id: "rec-man-2",
        action: "Request physical inspection on VOY-2419-B cargo",
        rationale: "Declared vs. observed draft gap exceeds 10% threshold.",
        risk: "MEDIUM",
        confidence: "inferred",
        route: "/cargo",
        evidence: [ev("e2", "Manifest MFT-77321", "NCS", "verified")],
      },
    ],
    historical: [
      {
        id: "h1",
        caseRef: "CASE-2023-402",
        summary: "Duplicate BOL cluster at Apapa — MFT-712xx.",
        matchPct: 74,
        outcome: "Closed · ₦210M assessed",
      },
    ],
    related: [
      { id: "r1", ref: "INV-8905", title: "Duplicate BOL cluster", status: "Open" },
    ],
  },
  cargo: {
    observations: [
      {
        id: "obs-c-1",
        text: "Seal integrity mismatch observed on 3 containers (MSKU7712340, TEMU5518821, GESU9012331) at Tin Can gate.",
        confidence: "verified",
        evidence: [ev("e1", "Terminal gate scan", "NPA", "verified")],
      },
    ],
    recommendations: [
      {
        id: "rec-c-1",
        action: "Hold 3 containers for physical verification",
        rationale: "Seal numbers observed do not match manifest seals.",
        risk: "HIGH",
        confidence: "verified",
        route: "/cargo",
        evidence: [ev("e1", "Terminal gate scan", "NPA", "verified")],
      },
    ],
    historical: [
      {
        id: "h1",
        caseRef: "CASE-2024-051",
        summary: "Seal mismatch cluster at Tin Can.",
        matchPct: 69,
        outcome: "Closed · seizure ₦88M",
      },
    ],
    related: [{ id: "r1", ref: "INV-8842", title: "Seal integrity — Tin Can", status: "Open" }],
  },
  revenue: {
    observations: [
      {
        id: "obs-r-1",
        text: "Revenue at risk today observed at ₦1.24B (+₦180M vs 7d avg); concentration observed at Apapa (₦640M) and Onne (₦310M).",
        confidence: "inferred",
        evidence: [
          ev("e1", "Revenue ledger snapshot", "NCS Revenue", "verified"),
          ev("e2", "Port intake feed", "NPA", "observed"),
        ],
      },
      {
        id: "obs-r-2",
        text: "5 companies observed with repeat undervaluation signals in the last 30 days (top: Oceanic Lines, Bluewave Holdings).",
        confidence: "inferred",
        evidence: [ev("e3", "Assessment history", "NCS", "verified")],
      },
    ],
    recommendations: [
      {
        id: "rec-r-1",
        action: "Escalate top 5 undervaluation candidates to Revenue Review",
        rationale: "Repeat signals observed across 30d, weighted by revenue exposure.",
        risk: "HIGH",
        confidence: "inferred",
        route: "/revenue",
        evidence: [ev("e3", "Assessment history", "NCS", "verified")],
      },
    ],
    historical: [
      {
        id: "h1",
        caseRef: "CASE-2024-207",
        summary: "HS 8703 undervaluation pattern — 4 companies.",
        matchPct: 78,
        outcome: "Recovered ₦1.1B",
      },
    ],
    related: [{ id: "r1", ref: "INV-8830", title: "Undervaluation review", status: "Escalated" }],
  },
  memory: {
    observations: [
      {
        id: "obs-m-1",
        text: "12 archived cases observed with ≥70% similarity to current active investigations.",
        confidence: "observed",
        evidence: [ev("e1", "Case archive", "Seaphore Memory", "verified")],
      },
    ],
    recommendations: [
      {
        id: "rec-m-1",
        action: "Attach precedent CASE-2024-118 to INV-8821 for reviewer context",
        rationale: "82% similarity observed on ownership + AIS-gap signals.",
        risk: "LOW",
        confidence: "observed",
        route: "/memory",
        evidence: [ev("e1", "Case archive", "Seaphore Memory", "verified")],
      },
    ],
    historical: [
      {
        id: "h1",
        caseRef: "CASE-2024-118",
        summary: "Shared-director cluster + STS off Bonny.",
        matchPct: 82,
        outcome: "Escalated · ₦640M",
      },
      {
        id: "h2",
        caseRef: "CASE-2023-402",
        summary: "Duplicate BOL cluster at Apapa.",
        matchPct: 74,
        outcome: "Closed · ₦210M assessed",
      },
    ],
    related: [
      { id: "r1", ref: "LES-2024-11", title: "Lesson: Cross-check CAC directors on new voyages", status: "Open" },
    ],
  },
};
