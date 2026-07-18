/**
 * External-provider adapter contracts.
 *
 * Every OSINT or commercial data provider MUST implement one of the interfaces
 * below. Adapters live in `src/adapters/{osint,commercial}/`. Feature code
 * only imports the adapter contract and the registry — never a concrete
 * provider. This enforces provider swappability and keeps confidence tagging
 * consistent because each adapter is responsible for declaring the confidence
 * tier of the data it returns.
 */

/** DB-level confidence tier — mirrors public.confidence_level enum. */
export type ConfidenceLevel = "VERIFIED" | "AUDITED" | "CORROBORATED" | "DECLARED" | "OBSERVED" | "INFERRED";


export interface ProviderMeta {
  /** Human-readable provider name (e.g. "MarineTraffic"). */
  name: string;
  /** Stable machine id used for audit logging & attribution. */
  id: string;
  /** Provider category. */
  kind: "osint" | "commercial";
  /** Default confidence tier assigned to records from this provider. */
  defaultConfidence: ConfidenceLevel;
  /** Free-text source citation stored on Evidence records. */
  citation: string;
}

// --- Vessel position / AIS ---
export interface VesselPosition {
  mmsi: string;
  imo?: string;
  lat: number;
  lng: number;
  sog?: number;
  cog?: number;
  timestamp: string;
  source: ProviderMeta;
}

export interface AisProvider {
  meta: ProviderMeta;
  getLatestPosition(mmsi: string): Promise<VesselPosition | null>;
  getTrack(mmsi: string, sinceIso: string): Promise<VesselPosition[]>;
}

// --- Sanctions / watchlist ---
export interface SanctionsHit {
  matchedName: string;
  listName: string;
  program?: string;
  score: number;
  reference?: string;
  source: ProviderMeta;
}

export interface SanctionsProvider {
  meta: ProviderMeta;
  screen(name: string, opts?: { country?: string }): Promise<SanctionsHit[]>;
}

// --- Weather / ocean conditions ---
export interface WeatherObservation {
  lat: number;
  lng: number;
  windKts?: number;
  swellMeters?: number;
  visibilityNm?: number;
  timestamp: string;
  source: ProviderMeta;
}

export interface WeatherProvider {
  meta: ProviderMeta;
  observe(lat: number, lng: number): Promise<WeatherObservation | null>;
}
