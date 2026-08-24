/**
 * SPRINT GOV-02 — Cargo Source Governance & Confidence Model (specification).
 *
 * This module is specification-only: it classifies evidence sources and
 * defines how Cargo Intelligence confidence is computed and explained.
 * It introduces NO providers, NO connectors, and NO changes to the Evidence
 * Provider Framework, Provider Resolver, IAL, IFE, UIP, OIE, MIBC, auth or
 * CAPABILITY.CARGO v1.0.
 */

import type { EvidenceGrade } from "@/services/ial/types";

// ── Source classification ────────────────────────────────────────────────

/** Four canonical source classes for national maritime evidence. */
export type SourceClass = "GOVERNMENT" | "COMMERCIAL" | "SUPPORTING" | "DERIVED";

/**
 * Trust level ladder. Trust is a property of the *authority*, not of any
 * single record — record-level quality is handled by the confidence model.
 */
export type TrustLevel =
  | "AUTHORITY_OF_RECORD"
  | "REGULATORY"
  | "VERIFIED_COMMERCIAL"
  | "AGGREGATED"
  | "OPEN_SOURCE"
  | "DERIVED_ANALYTIC";

export type IntegrationStatus =
  | "INTEGRATED"
  | "PILOT"
  | "CREDENTIALS_PENDING"
  | "SPECIFIED"
  | "NOT_STARTED";

export type Priority = "P0" | "P1" | "P2" | "P3";

export type UpdateFrequency =
  | "REALTIME"
  | "HOURLY"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "EVENT_DRIVEN"
  | "AD_HOC";

/** Coverage of the national cargo picture this source can speak to. */
export interface SourceCoverage {
  /** 0..1 share of the relevant population the source can answer for. */
  readonly breadth: number;
  /** 0..1 field-level depth of a typical record. */
  readonly depth: number;
  /** Free-text scope note shown to officers. */
  readonly note: string;
}

export interface DataSourceRecord {
  /** Stable kebab-case id used by governance views and matrices. */
  readonly id: string;
  readonly name: string;
  readonly sourceClass: SourceClass;
  /** Legal or commercial authority behind the data. */
  readonly authority: string;
  /** ISO-3166 alpha-2 codes, or "GLOBAL". */
  readonly jurisdiction: ReadonlyArray<string>;
  /** Evidence types the source can produce (Cargo vocabulary where relevant). */
  readonly evidenceTypes: ReadonlyArray<string>;
  /** Seaphore capability ids the source can serve. */
  readonly capabilities: ReadonlyArray<string>;
  readonly trustLevel: TrustLevel;
  readonly coverage: SourceCoverage;
  readonly updateFrequency: UpdateFrequency;
  readonly priority: Priority;
  readonly integrationStatus: IntegrationStatus;
  /** Officer-facing statement of how the source should and should not be used. */
  readonly recommendedUsage: string;
}

// ── Cargo confidence model ──────────────────────────────────────────────

/** The eight weighted evidence axes for Cargo Intelligence. */
export type CargoEvidenceAxis =
  | "government_declaration"
  | "nimasa_return"
  | "bill_of_lading"
  | "ais_voyage"
  | "company_verification"
  | "revenue_assessment"
  | "sanctions"
  | "supporting_intelligence";

/** A–E confidence grade projected next to every cargo number. */
export type CargoConfidenceGrade = "A" | "B" | "C" | "D" | "E";

/** One axis as observed for a specific cargo subject. */
export interface CargoAxisObservation {
  readonly axis: CargoEvidenceAxis;
  /** true when at least one record for this axis is present. */
  readonly present: boolean;
  /** 0..1 quality of the present record(s): completeness × freshness. */
  readonly quality?: number;
  /** Number of independent sources supporting this axis. */
  readonly corroboration?: number;
  /** true when sources on this axis disagree. */
  readonly conflicting?: boolean;
  /** Source ids from the registry that contributed. */
  readonly sourceIds?: ReadonlyArray<string>;
  /** Grade already carried by the underlying evidence, when known. */
  readonly grade?: EvidenceGrade;
}

export interface CargoAxisContribution {
  readonly axis: CargoEvidenceAxis;
  readonly label: string;
  readonly weight: number;
  /** 0..1 achieved fraction of the axis weight. */
  readonly achieved: number;
  /** Percentage points contributed to the final score. */
  readonly points: number;
  readonly present: boolean;
  readonly conflicting: boolean;
  readonly sourceIds: ReadonlyArray<string>;
}

export interface CargoConfidenceAssessment {
  /** 0–100. */
  readonly score: number;
  readonly grade: CargoConfidenceGrade;
  readonly breakdown: ReadonlyArray<CargoAxisContribution>;
  readonly missingEvidence: ReadonlyArray<{
    axis: CargoEvidenceAxis;
    label: string;
    impact: number;
  }>;
  readonly conflictingEvidence: ReadonlyArray<{ axis: CargoEvidenceAxis; label: string }>;
  /** Single officer-facing sentence explaining the score. */
  readonly explanation: string;
}
