/**
 * SEAPHORE Data Source Matrix — client-safe mirror of public.data_sources.
 *
 * This constant IS the source-of-truth vocabulary the UI reads at build time.
 * The database row for each entry (same `id`) is the runtime source-of-truth
 * an administrator can override. Feature code should:
 *   1. Read the DB row via `useDataSources()` when rendering status chips.
 *   2. Fall back to this constant for citation / defaultConfidence so that
 *      chip metadata is always present even during a cold cache.
 */

import type { SourceRegistryEntry } from "./status";

export const DATA_SOURCE_MATRIX: readonly SourceRegistryEntry[] = [
  {
    id: "spire",
    dataType: "Vessel AIS positions (live)",
    provider: "Spire Maritime",
    status: "PLANNED",
    kind: "ais",
    defaultConfidence: "OBSERVED",
    citation: "Spire Maritime AIS (spire.com)",
    scope: "commercial",
    notes:
      "Until active: show last-known position with OBSERVED chip + timestamp. Never shown as current.",
  },
  {
    id: "datalastic",
    dataType: "Vessel AIS positions (historical)",
    provider: "Datalastic",
    status: "ACTIVE",
    kind: "ais_history",
    defaultConfidence: "OBSERVED",
    citation: "Datalastic historical AIS (datalastic.com)",
    scope: "commercial",
    notes: "Historical route data for voyage workspace and knowledge graph.",
  },
  {
    id: "imo_gisis",
    dataType: "Vessel particulars",
    provider: "IMO GISIS + Equasis",
    status: "ACTIVE",
    kind: "vessel_ref",
    defaultConfidence: "VERIFIED",
    citation: "IMO GISIS & Equasis vessel registry",
    scope: "osint",
    notes: "IMO, type, flag, GT, DWT, class, builder.",
  },
  {
    id: "cac_nigeria",
    dataType: "Company registration",
    provider: "Nigeria CAC",
    status: "ACTIVE",
    kind: "company_reg",
    defaultConfidence: "VERIFIED",
    citation: "Nigeria Corporate Affairs Commission (cac.gov.ng)",
    scope: "osint",
    notes: "CAC number, directors, registered address.",
  },
  {
    id: "sanctions",
    dataType: "Sanctions screening",
    provider: "OFAC SDN + UN Consolidated",
    status: "ACTIVE",
    kind: "sanctions",
    defaultConfidence: "VERIFIED",
    citation: "OFAC SDN + UN Consolidated Sanctions List",
    scope: "osint",
    notes: "Auto-checked on entity creation.",
  },
  {
    id: "manifest_upload",
    dataType: "Manifests",
    provider: "User upload (PDF/XLSX/JPG)",
    status: "ACTIVE",
    kind: "upload",
    defaultConfidence: "DECLARED",
    citation: "Officer-uploaded manifest document",
    scope: "user",
    notes: "OCR via Google Vision. Validation via server function.",
  },
  {
    id: "bol_upload",
    dataType: "Bills of Lading",
    provider: "User upload",
    status: "ACTIVE",
    kind: "upload",
    defaultConfidence: "DECLARED",
    citation: "Officer-uploaded Bill of Lading document",
    scope: "user",
    notes: "Extracted and linked to voyage.",
  },
  {
    id: "volza",
    dataType: "Trade data (import records)",
    provider: "Volza (Nigeria lanes)",
    status: "ACTIVE",
    kind: "trade",
    defaultConfidence: "CORROBORATED",
    citation: "Volza cross-border trade dataset (volza.com)",
    scope: "commercial",
    notes: "Cross-border comparison for manifest validation.",
  },
  {
    /*
     * Trade Atlas — a second, independent trade intelligence provider.
     *
     * Deliberately not a replacement for Volza and not a fallback behind
     * it. Both are `trade` kind and both may contribute evidence for the
     * same claim; which one wins a given contradiction is decided
     * per-claim by freshness and grade, through `ATTRIBUTE_AUTHORITY`
     * under `trade.flow`, where the two sit at equal weight. Encoding a
     * primary/backup relationship here would bake a procurement choice
     * into the scoring layer.
     *
     * PLANNED, not ACTIVE: no adapter is connected, and `PlannedSourceError`
     * is what feature code will receive until one is.
     */
    id: "trade_atlas",
    dataType: "Trade intelligence (import/export flows, trade relationships)",
    provider: "Trade Atlas",
    status: "PLANNED",
    kind: "trade",
    defaultConfidence: "CORROBORATED",
    citation: "Trade Atlas global trade intelligence dataset",
    scope: "commercial",
    notes:
      "Infrastructure registered in M2.8; no credentials and no adapter implementation. " +
      "Coexists with Volza as an independent trade source — neither is primary.",
  },
  {
    /*
     * SeaVantage — vessel tracking and historical movement.
     *
     * The AIS registry (`services/eo/ais-providers.ts`) already carries
     * this provider as PENDING_CREDENTIALS with its capability matrix.
     * This entry exists so the *data source matrix* — which is what the
     * source-availability surfaces read — agrees with the AIS registry
     * rather than omitting a provider the rest of the system knows about.
     */
    id: "seavantage",
    dataType: "AIS positions and historical vessel tracks",
    provider: "SeaVantage",
    status: "PLANNED",
    kind: "ais_history",
    defaultConfidence: "OBSERVED",
    citation: "SeaVantage vessel tracking platform",
    scope: "commercial",
    notes:
      "Registered in services/eo/ais-providers.ts as PENDING_CREDENTIALS. " +
      "No adapter implementation; awaiting credentials and API documentation.",
  },
  {
    id: "port_congestion",
    dataType: "Port congestion",
    provider: "NPA / internal model",
    status: "INFERRED",
    kind: "model",
    defaultConfidence: "INFERRED",
    citation: "Seaphore port congestion model (NPA + queue history)",
    scope: "internal",
    notes: "Computed from vessel queue + historical patterns.",
  },
  {
    id: "nimasa_levy",
    dataType: "Revenue / levy data",
    provider: "NIMASA internal system",
    status: "ACTIVE",
    kind: "revenue",
    defaultConfidence: "VERIFIED",
    citation: "NIMASA 3% levy system of record",
    scope: "internal",
    notes: "3% levy records, assessments, receipts.",
  },
  {
    id: "platts",
    dataType: "Cargo values (market price)",
    provider: "Platts / Trading Economics",
    status: "PLANNED",
    kind: "market",
    defaultConfidence: "CORROBORATED",
    citation: "S&P Global Platts / Trading Economics",
    scope: "commercial",
    notes: "Used for declared-value vs market-value comparison.",
  },
  {
    id: "flag_registry",
    dataType: "Flag registry",
    provider: "Panama · Liberia · Marshall Islands",
    status: "ACTIVE",
    kind: "flag",
    defaultConfidence: "VERIFIED",
    citation: "National flag state registries",
    scope: "osint",
    notes: "Flag state verification.",
  },
  {
    id: "companies_house",
    dataType: "Corporate ownership",
    provider: "UK Companies House + Offshore registries",
    status: "PARTIAL",
    kind: "ownership",
    defaultConfidence: "DECLARED",
    citation: "UK Companies House + offshore corporate registries",
    scope: "osint",
    notes: "Beneficial ownership often INFERRED, not VERIFIED.",
  },
  {
    id: "pi_insurance",
    dataType: "P&I insurance",
    provider: "Insurer publications",
    status: "PLANNED",
    kind: "insurance",
    defaultConfidence: "DECLARED",
    citation: "P&I Club member publications",
    scope: "commercial",
    notes: "For vessel compliance panel.",
  },
  {
    id: "weather",
    dataType: "Weather/sea state",
    provider: "—",
    status: "NOT_IN_SCOPE",
    kind: "weather",
    defaultConfidence: "OBSERVED",
    citation: "n/a",
    scope: "osint",
    notes: "Removed from Mission Control. Not an officer action domain.",
  },
  {
    id: "google_vision",
    dataType: "OCR (manifest/document)",
    provider: "Google Vision API",
    status: "ACTIVE",
    kind: "ocr",
    defaultConfidence: "DECLARED",
    citation: "Google Cloud Vision OCR",
    scope: "ai",
    notes: "Called via server function on upload.",
  },
  {
    id: "gemini",
    dataType: "AI reasoning",
    provider: "Google Gemini 1.5 Pro",
    status: "ACTIVE",
    kind: "ai",
    defaultConfidence: "INFERRED",
    citation: "Google Gemini 1.5 Pro reasoning",
    scope: "ai",
    notes: "Copilot queries, pattern interpretation, brief generation.",
  },
] as const;

export function getMatrixEntry(id: string): SourceRegistryEntry {
  const hit = DATA_SOURCE_MATRIX.find((e) => e.id === id);
  if (!hit) throw new Error(`[Seaphore] Unknown data source id: ${id}`);
  return hit;
}
