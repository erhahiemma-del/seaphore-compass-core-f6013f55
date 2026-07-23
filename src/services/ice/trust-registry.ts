/**
 * Trust registry — mirrors the seeded `osint_source_trust` table but
 * kept in code so the client can score without a round-trip. If a
 * (source, category) pair is missing we return the AVERAGE_TRUST rather
 * than zero, so unknown sources never disappear from fusion.
 */

import type { ConnectorId } from "@/services/ial/types";
import type { FieldCategory } from "./types";

type TrustMap = Readonly<Record<string, Readonly<Record<string, number>>>>;

const TRUST: TrustMap = {
  "imo-gisis":     { IDENTITY: 100, OWNERSHIP: 100, COMPLIANCE: 90 },
  "equasis":       { IDENTITY: 95,  OWNERSHIP: 90,  COMPLIANCE: 85 },
  "marinetraffic": { IDENTITY: 80,  POSITION: 95,   VOYAGE: 90 },
  "ais":           { POSITION: 90,  VOYAGE: 85 },
  "opensanctions": { SANCTIONS: 95, OWNERSHIP: 70 },
  "customs":       { CARGO: 95,     VOYAGE: 80 },
  "nimasa":        { COMPLIANCE: 95, IDENTITY: 80 },
  "noaa":          { WEATHER: 95 },
  "gfw":           { POSITION: 80 },
  "trade-atlas":   { CARGO: 80,     OWNERSHIP: 60 },
  "lloyds-list":   { COMPLIANCE: 88, OWNERSHIP: 75 },
};

/** Average of all known trust scores. Unknown sources default here. */
export const AVERAGE_TRUST = (() => {
  const all = Object.values(TRUST).flatMap((v) => Object.values(v));
  return all.length ? all.reduce((a, b) => a + b, 0) / all.length : 70;
})();

export function trustFor(source: ConnectorId, category: FieldCategory): number {
  const byCat = TRUST[source];
  if (!byCat) return AVERAGE_TRUST;
  const v = byCat[category];
  if (typeof v === "number") return v;
  // If the source is known but not for this category, fall to a
  // conservative half-known/half-average so authority still counts.
  const known = Object.values(byCat);
  const src = known.length ? known.reduce((a, b) => a + b, 0) / known.length : AVERAGE_TRUST;
  return (src + AVERAGE_TRUST) / 2;
}
