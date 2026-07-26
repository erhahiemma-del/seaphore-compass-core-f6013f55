/**
 * SPRINT CAP-04 — Cargo Investigation Copilot · types.
 *
 * The cargo dossier is a *deterministic projection* of the Canonical
 * UIP through the Cargo Knowledge Graph. It contains no provider logic,
 * performs no acquisition, and never invents a value: a section with no
 * supporting evidence says so and names what is missing.
 */
import type { EvidenceGrade } from "@/services/ial/types";
import type {
  CargoGraphNode,
  CargoInvestigationContext,
  CargoNodeRole,
  CargoTimelineEvent,
} from "@/services/cargo-graph";

/** The cargo investigations CAP-04 must answer. */
export type CargoIntent =
  | "investigate-shipment"
  | "containers-for-company"
  | "bills-of-lading"
  | "revenue-leakage"
  | "cargo-risk"
  | "related-vessels"
  | "cargo-timeline";

export interface CargoRoute {
  readonly intent: CargoIntent;
  /** The phrase the officer used that triggered cargo routing. */
  readonly trigger: string;
  /** Free-text subject lifted from the query, before graph resolution. */
  readonly subjectTerm: string | null;
  /** Canonical UIP entity id, once resolved against the graph. */
  readonly focusId: string | null;
  /** Why the focus resolved (or did not) — shown to the officer. */
  readonly resolution: string;
  /** 0..1 — routing confidence, never presented as intelligence confidence. */
  readonly score: number;
}

export interface CargoCitation {
  readonly evidenceId: string;
  readonly source: string;
  readonly observedAt: string;
  readonly grade: EvidenceGrade;
}

export type CargoSectionId =
  | "executive-summary"
  | "cargo-timeline"
  | "related-companies"
  | "related-containers"
  | "manifest-summary"
  | "revenue-analysis"
  | "risk-assessment"
  | "customs-intelligence"
  | "ai-recommendations"
  | "next-best-actions";

export interface CargoSection {
  readonly id: CargoSectionId;
  readonly title: string;
  /** Officer-readable lines. Never a raw object dump. */
  readonly lines: ReadonlyArray<string>;
  /** Weakest supporting grade for everything in this section. */
  readonly grade: EvidenceGrade;
  readonly citations: ReadonlyArray<CargoCitation>;
  /** True when no evidence supports this section at all. */
  readonly empty: boolean;
  /** What is missing, stated plainly. Only set when `empty` or partial. */
  readonly gap: string | null;
}

export interface CargoDossier {
  readonly route: CargoRoute;
  readonly focus: CargoGraphNode | null;
  readonly context: CargoInvestigationContext | null;
  /** Always all ten sections, in the mandated order. */
  readonly sections: ReadonlyArray<CargoSection>;
  readonly timeline: ReadonlyArray<CargoTimelineEvent>;
  readonly gaps: ReadonlyArray<CargoNodeRole>;
  readonly grade: EvidenceGrade;
  readonly evidenceCount: number;
  readonly uipId: string | null;
  readonly generatedAt: string;
  /** True when the Canonical UIP holds no cargo evidence for this focus. */
  readonly empty: boolean;
}
