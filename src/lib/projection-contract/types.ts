/**
 * Officer-Facing Projection Contract — types.
 *
 * Enforces the Seaphore Golden Rule: every backend intelligence artifact must
 * resolve to exactly one of three projection states so nothing disappears
 * silently between backend and UI.
 *
 *   1. PROJECTED   — surfaced to the officer with a defined UI location.
 *   2. INTERNAL    — deliberately hidden as implementation detail.
 *   3. JUSTIFIED   — omitted from officer view with a written justification.
 *
 * This module owns the vocabulary. The registry (registry.ts) owns the
 * catalog. The validator (validate.ts) enforces exhaustiveness.
 */

export type ProjectionState = "PROJECTED" | "INTERNAL" | "JUSTIFIED_UNNECESSARY";

export type BackendLayer =
  | "IAL"
  | "IFE"
  | "ICE"
  | "OIE"
  | "IBE"
  | "REASONING"
  | "COPILOT"
  | "WORKSPACE"
  | "COMPLIANCE"
  | "OBSERVABILITY"
  | "AUDIT"
  | "CAPABILITY";

/** Where an item appears in the officer experience. */
export interface UIProjection {
  /** Short officer-facing label ("Confidence chip", "Hypothesis Ledger"). */
  surface: string;
  /** Route or component path where the projection lives. */
  location: string;
  /** How the officer interacts with it. */
  interaction: "passive-display" | "hover-explainer" | "drill-in" | "action";
  /** Which component renders the projection, when it's a discrete component. */
  component?: string;
}

/** Why an item is deliberately hidden. */
export type InternalReason =
  | "implementation-detail"
  | "raw-transport"
  | "developer-diagnostic"
  | "sensitive-lineage";

export interface InternalFlag {
  reason: InternalReason;
  note: string;
}

/** Why an item is omitted despite being intelligence-bearing. */
export interface JustifiedOmission {
  /** Written justification shown in the audit view. */
  justification: string;
  /** Officer role that signed off (Administrator/Director). */
  approvedBy?: "Administrator" | "Director" | "Officer";
  approvedAt?: string;
}

/** One backend intelligence artifact and its projection contract. */
export interface ProjectionContractEntry {
  /** Stable id (kebab-case). Referenced from tests and audit views. */
  id: string;
  /** Human-readable artifact name. */
  name: string;
  /** Backend service or engine that produces the artifact. */
  producer: BackendLayer;
  /** One-sentence description of what the artifact carries. */
  description: string;
  /** Terminal projection state. */
  state: ProjectionState;
  /** Present iff state === "PROJECTED". */
  projection?: UIProjection;
  /** Present iff state === "INTERNAL". */
  internal?: InternalFlag;
  /** Present iff state === "JUSTIFIED_UNNECESSARY". */
  justified?: JustifiedOmission;
  /** Free-form owner tag for future capabilities added under the Golden Rule. */
  owner?: string;
  /** ISO date when this contract entry was last reviewed. */
  reviewedAt: string;
}

export interface ContractValidationIssue {
  id: string;
  problem: string;
}

export interface ContractValidationReport {
  totalEntries: number;
  projected: number;
  internal: number;
  justified: number;
  issues: ContractValidationIssue[];
  ok: boolean;
}
