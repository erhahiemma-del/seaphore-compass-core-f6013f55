/**
 * Operational Knowledge Layer (OKL) — public entry.
 *
 * Consumes a Unified Intelligence Package (UIP) and yields explainable,
 * evidence-backed operational patterns and recommendations. The officer
 * decides.
 */
export * from "./types";
export { analyzeOperationalKnowledge } from "./engine";
export type { AnalyzeOklInput } from "./engine";
