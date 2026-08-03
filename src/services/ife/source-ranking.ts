/**
 * Source ranking table.
 *
 * The IFE ranks providers on six axes (authority, reliability, coverage,
 * freshness, latency, completeness). Freshness comes from the evidence
 * itself; the other five are static per provider and live here. Adding a
 * new connector = adding a row to this table; no other IFE file changes.
 */
import type { ConnectorId } from "@/services/ial/types";
import type { SourceProfile } from "./types";

const AUTHORITY_WEIGHT: Record<SourceProfile["authority"], number> = {
  government: 1.0,
  regulator: 0.92,
  official: 0.85,
  commercial: 0.65,
  osint: 0.45,
};

/**
 * Default ranking. Values are curated conservatively — the IFE never
 * assumes a commercial API is as authoritative as a regulator, but never
 * discards a source entirely.
 */
export const DEFAULT_SOURCE_PROFILE: Record<string, SourceProfile> = {
  ais: {
    connectorId: "ais",
    authority: "commercial",
    reliability: 0.86,
    coverage: 0.55,
    latencyMsP50: 400,
    completeness: 0.75,
  },
  marinetraffic: {
    connectorId: "marinetraffic",
    authority: "commercial",
    reliability: 0.82,
    coverage: 0.62,
    latencyMsP50: 550,
    completeness: 0.78,
  },
  equasis: {
    connectorId: "equasis",
    authority: "official",
    reliability: 0.9,
    coverage: 0.6,
    latencyMsP50: 900,
    completeness: 0.82,
  },
  "imo-gisis": {
    connectorId: "imo-gisis",
    authority: "regulator",
    reliability: 0.94,
    coverage: 0.5,
    latencyMsP50: 1400,
    completeness: 0.85,
  },
  opensanctions: {
    connectorId: "opensanctions",
    authority: "official",
    reliability: 0.88,
    coverage: 0.35,
    latencyMsP50: 600,
    completeness: 0.7,
  },
  noaa: {
    connectorId: "noaa",
    authority: "government",
    reliability: 0.95,
    coverage: 0.3,
    latencyMsP50: 700,
    completeness: 0.9,
  },
  gfw: {
    connectorId: "gfw",
    authority: "osint",
    reliability: 0.72,
    coverage: 0.4,
    latencyMsP50: 800,
    completeness: 0.68,
  },
  customs: {
    connectorId: "customs",
    authority: "government",
    reliability: 0.93,
    coverage: 0.35,
    latencyMsP50: 1500,
    completeness: 0.8,
  },
  nimasa: {
    connectorId: "nimasa",
    authority: "government",
    reliability: 0.94,
    coverage: 0.4,
    latencyMsP50: 1200,
    completeness: 0.82,
  },
};

const UNKNOWN_PROFILE: SourceProfile = {
  connectorId: "unknown",
  authority: "osint",
  reliability: 0.6,
  coverage: 0.3,
  latencyMsP50: 1500,
  completeness: 0.55,
};

export function profileFor(connectorId: ConnectorId): SourceProfile {
  return DEFAULT_SOURCE_PROFILE[connectorId] ?? { ...UNKNOWN_PROFILE, connectorId };
}

export function authorityWeight(p: SourceProfile): number {
  return AUTHORITY_WEIGHT[p.authority] ?? 0.5;
}

/**
 * A single 0..1 scalar that combines all static ranking axes and the
 * dynamic freshness of a specific record. Freshness decays over 72 hours
 * — anything older contributes zero freshness weight but the record is
 * still eligible (the IFE surfaces it as `historical` on the timeline).
 */
export function sourceWeight(connectorId: ConnectorId, freshnessSeconds: number): number {
  const p = profileFor(connectorId);
  const authority = authorityWeight(p);
  const latency = clamp01(1 - p.latencyMsP50 / 5000);
  const freshness = clamp01(1 - freshnessSeconds / (72 * 3600));
  // Weighted blend — authority dominates, then reliability, then breadth.
  return (
    0.35 * authority +
    0.22 * p.reliability +
    0.13 * p.coverage +
    0.12 * p.completeness +
    0.1 * latency +
    0.08 * freshness
  );
}

export function isOfficialSource(connectorId: ConnectorId): boolean {
  const p = profileFor(connectorId);
  return p.authority === "government" || p.authority === "regulator" || p.authority === "official";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
