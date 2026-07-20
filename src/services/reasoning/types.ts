/**
 * Sprint 8 · Reasoning Engine — public types.
 * Layer 6 (AI & Prompt Contracts) · Layer 2.3 (Reasoning Policy) · Layer 2.11.
 *
 * The engine receives ONLY ranked evidence from Fusion (Sprint 7),
 * plus a query and lightweight workspace context. It never touches
 * the database or the retrieval layer.
 */
import type { FusedEvidenceBundle } from "@/services/fusion";

/** Workspace overlays — each has its own analytical lens. */
export const WORKSPACES = [
  "general",
  "ownership",
  "revenue",
  "compliance",
  "manifest",
  "evidence",
  "forecast",
] as const;
export type Workspace = (typeof WORKSPACES)[number];

/** Model tier — Layer 6.1 model-agnostic interface. */
export type ModelTier = "tier1" | "tier2" | "tier3";

export interface ReasoningRequest {
  readonly query: string;
  readonly workspace: Workspace;
  readonly evidence: FusedEvidenceBundle;
  readonly context?: {
    readonly investigationId?: string;
    readonly officerId?: string;
    readonly entityFocus?: readonly string[];
  };
  /** Preferred tier — engine may downgrade on failure. */
  readonly tier?: ModelTier;
}

/** Layer 2.11 propagation ladder — degradation across reasoning steps. */
export interface ConfidencePropagation {
  readonly evidence: number;
  readonly relationship: number;
  readonly pattern: number;
  readonly assessment: number;
  readonly recommendation: number;
}

export type ConfidenceBand = "high" | "medium" | "low" | "insufficient";

export interface WhyChainStep {
  readonly step: number;
  readonly statement: string;
  readonly evidenceIds: readonly string[];
  readonly confidence: number;
}

export interface CounterHypothesis {
  readonly statement: string;
  readonly likelihood: number;
  readonly refutingEvidenceIds: readonly string[];
}

export interface Assessment {
  readonly statement: string;
  readonly confidence: number;
  readonly band: ConfidenceBand;
}

export interface Recommendation {
  readonly action: string;
  readonly confidence: number;
  readonly rationale: string;
}

export interface ModelMeta {
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly retries: number;
  readonly durationMs: number;
  readonly usedFallback: boolean;
}

export interface ReasoningResponse {
  readonly workspace: Workspace;
  readonly assessment: Assessment;
  readonly recommendation: Recommendation;
  readonly whyChain: readonly WhyChainStep[];
  readonly counterHypotheses: readonly CounterHypothesis[];
  readonly propagation: ConfidencePropagation;
  readonly citations: readonly string[];
  /** HR-4 / HR-11 — mandatory officer-decides notice. */
  readonly officerNotice: string;
  readonly model: ModelMeta;
}

/** Model-agnostic interface — every provider adapter implements this. */
export interface ModelClient {
  readonly id: string;
  readonly tier: ModelTier;
  /**
   * Complete a JSON-only response given a system + user prompt.
   * Implementations MUST NOT swallow errors — throw on transport failure so
   * the engine can retry / downgrade.
   */
  complete(input: {
    system: string;
    user: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; tokensIn?: number; tokensOut?: number }>;
}
