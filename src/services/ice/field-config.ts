/**
 * ICE field configuration — pure data. Categorises every canonical field
 * for trust lookup, freshness decay, quality scoring, and conflict
 * severity classification. Kept in one place so behaviour is auditable.
 */

import type { ConnectorId } from "@/services/ial/types";
import type { FieldCategory, Severity } from "./types";

/** Aliases the Normaliser accepts from providers. Everything is folded
 *  into the canonical (lower-snake_case) field name. */
export const FIELD_ALIASES: ReadonlyArray<{ canonical: string; aliases: string[] }> = [
  { canonical: "vessel_name", aliases: ["vesselName", "ship_name", "name", "vessel", "shipName"] },
  { canonical: "imo_number", aliases: ["imo", "imoNumber", "IMO", "imo_no", "imonumber"] },
  { canonical: "mmsi", aliases: ["MMSI", "mmsi_number"] },
  {
    canonical: "flag_state",
    aliases: ["flag", "flagState", "nationality", "flagCountry", "country_flag"],
  },
  { canonical: "vessel_owner", aliases: ["owner", "shipOwner", "registeredOwner", "ownerName"] },
  { canonical: "vessel_manager", aliases: ["manager", "shipManager", "technicalManager"] },
  { canonical: "beneficial_owner", aliases: ["beneficialOwner", "ubo", "ultimate_owner"] },
  { canonical: "gross_tonnage", aliases: ["gt", "grossTonnage", "GRT", "grossTons"] },
  { canonical: "cargo_weight", aliases: ["weight", "grossWeight", "weightMT", "tonnage"] },
  { canonical: "cargo_type", aliases: ["cargo", "cargoType", "cargoDescription", "commodityType"] },
  { canonical: "hs_code", aliases: ["hs", "hsCode", "HS_CODE", "tariffCode", "cnCode"] },
  { canonical: "eta", aliases: ["ETA", "expectedArrival", "estimatedArrival"] },
  { canonical: "port_of_call", aliases: ["port", "portOfCall", "callPort", "destinationPort"] },
  { canonical: "sanctions_status", aliases: ["sanctions", "sanctionsList", "onSanctionsList"] },
  { canonical: "psc_detentions", aliases: ["pscDetentions", "detentions"] },
  { canonical: "lat", aliases: ["latitude"] },
  { canonical: "lon", aliases: ["longitude", "lng"] },
  { canonical: "speed", aliases: ["speedKnots", "sog"] },
];

/** Canonical field → category. Used by the trust engine and freshness
 *  engine. Unknown fields fall through to OTHER. */
export const FIELD_CATEGORY: Readonly<Record<string, FieldCategory>> = {
  vessel_name: "IDENTITY",
  imo_number: "IDENTITY",
  mmsi: "IDENTITY",
  call_sign: "IDENTITY",
  flag_state: "IDENTITY",
  vessel_owner: "OWNERSHIP",
  vessel_manager: "OWNERSHIP",
  beneficial_owner: "OWNERSHIP",
  cargo_type: "CARGO",
  cargo_weight: "CARGO",
  hs_code: "CARGO",
  consignee: "CARGO",
  shipper: "CARGO",
  sanctions_status: "SANCTIONS",
  psc_detentions: "COMPLIANCE",
  deficiencies: "COMPLIANCE",
  class_status: "COMPLIANCE",
  lat: "POSITION",
  lon: "POSITION",
  speed: "POSITION",
  heading: "POSITION",
  eta: "POSITION",
  port_of_call: "VOYAGE",
  port_of_origin: "VOYAGE",
  next_port: "VOYAGE",
  gross_tonnage: "IDENTITY",
  wave_height: "WEATHER",
  wind_speed: "WEATHER",
};

/** Max freshness in hours per canonical field. Beyond this, freshness
 *  score falls to zero and the STALE tag is applied. */
export const FRESHNESS_MAX_HOURS: Readonly<Record<string, number>> = {
  eta: 6,
  lat: 6,
  lon: 6,
  speed: 6,
  heading: 6,
  sanctions_status: 24,
  cargo_weight: 72,
  cargo_type: 72,
  hs_code: 72,
  vessel_owner: 168,
  vessel_manager: 168,
  flag_state: 720,
  imo_number: 720,
  mmsi: 720,
  beneficial_owner: 720,
};
const DEFAULT_FRESHNESS_MAX_HRS = 168;

export function freshnessMaxHrs(field: string): number {
  return FRESHNESS_MAX_HOURS[field] ?? DEFAULT_FRESHNESS_MAX_HRS;
}

/** Fields that trigger CRITICAL severity when they conflict. */
export const CRITICAL_FIELDS: ReadonlyArray<string> = ["imo_number", "mmsi", "sanctions_status"];

/** Field-quality axis of Evidence Score. Higher for well-structured
 *  registry values, lower for free text and inferred values. */
export function fieldQuality(field: string): number {
  const structuredRegistry = new Set([
    "imo_number",
    "mmsi",
    "hs_code",
    "port_of_call",
    "flag_state",
  ]);
  const numericWithUnit = new Set(["cargo_weight", "gross_tonnage", "speed", "lat", "lon"]);
  const freeText = new Set(["cargo_type", "cargo_description", "notes", "description"]);
  if (structuredRegistry.has(field)) return 95;
  if (numericWithUnit.has(field)) return 85;
  if (freeText.has(field)) return 60;
  return 80; // normalised strings (vessel_name, vessel_owner, ...)
}

/** Human-readable source names for explainability. */
export const SOURCE_LABEL: Readonly<Record<ConnectorId, string>> = {
  ais: "AIS Feed",
  equasis: "Equasis",
  "imo-gisis": "IMO GISIS",
  marinetraffic: "MarineTraffic",
  opensanctions: "OpenSanctions",
  noaa: "NOAA",
  gfw: "Global Fishing Watch",
  customs: "Customs Registry",
  nimasa: "NIMASA",
  "trade-atlas": "Trade Atlas",
  "lloyds-list": "Lloyd's List",
};

/** Fallback numeric-conflict tolerance. Cargo weight / GT differ by
 *  rounding routinely; anything ≤ 2 % is not a conflict. */
export const NUMERIC_TOLERANCE = 0.02;

/** ETA / timestamp tolerance in minutes. */
export const TIMESTAMP_TOLERANCE_MINUTES = 60;

/** Conflict severity classifier. */
export function classifySeverity(
  field: string,
  majority: unknown,
  minority: unknown,
): { severity: Severity; isCritical: boolean } {
  if (CRITICAL_FIELDS.includes(field)) return { severity: "CRITICAL", isCritical: true };
  if (field === "vessel_owner" || field === "beneficial_owner")
    return { severity: "HIGH", isCritical: false };
  if (field === "cargo_weight" && typeof majority === "number" && typeof minority === "number") {
    const diff = Math.abs(majority - minority) / Math.max(Math.abs(majority), 1);
    return { severity: diff > 0.05 ? "HIGH" : "LOW", isCritical: false };
  }
  if (field === "cargo_type") return { severity: "MEDIUM", isCritical: false };
  if (field === "eta") return { severity: "MEDIUM", isCritical: false };
  return { severity: "LOW", isCritical: false };
}
