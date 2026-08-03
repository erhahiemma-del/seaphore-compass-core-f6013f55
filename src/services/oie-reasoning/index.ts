/**
 * Sprint 2.5 — OIE Reasoning barrel.
 *
 * Distinct from `src/services/oie/` (Copilot conversation engine). This module
 * hosts the OIE reasoning layer that sits above the OKL: read-only,
 * connector-free, explainable insights over historical knowledge.
 */
export type { OieInsight, OieInsightBundle, OieInsightKind, OieProvenanceRef } from "./types";
export { generateOieInsights } from "@/lib/oie-reasoning.functions";
