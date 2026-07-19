/**
 * SEAPHORE data-model exports.
 *
 * The database is the single source of truth. These helpers surface the
 * generated enums, the fixed confidence mapping, and canonical relationship
 * type strings so no module invents its own.
 */

import type { Database } from "@/integrations/supabase/types";

export type EntityType = Database["public"]["Enums"]["entity_type"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type VoyageStatus = Database["public"]["Enums"]["voyage_status"];
export type InvestigationStatus = Database["public"]["Enums"]["investigation_status"];

export const ENTITY_TYPES = [
  "vessel",
  "company",
  "person",
  "voyage",
  "cargo",
  "container",
  "document",
  "port",
  "investigation",
  "evidence",
  "intelligence_report",
  "agency",
  "regulation",
] as const satisfies readonly EntityType[];

export const APP_ROLES = [
  "analyst",
  "officer",
  "director",
  "admin",
] as const satisfies readonly AppRole[];

/**
 * Canonical relationship type strings. `relationships.type` is a free text
 * column, but every write must pick from this list — the data model calls
 * out these edges specifically. Add new edges here before using them.
 */
export const RELATIONSHIP_TYPES = {
  // Vessel
  OWNED_BY: "owned-by",
  OPERATED_BY: "operated-by",
  MADE_VOYAGE: "made-voyage",
  // Company
  OWNS: "owns",
  HAS_DIRECTOR: "has-director",
  HANDLED_VOYAGE: "handled-voyage",
  // Person
  DIRECTOR_OF: "director-of",
  COMMANDED: "commanded",
  // Voyage
  SAILED_BY: "sailed-by",
  HAS_DOCUMENT: "has-document",
  INVESTIGATED_BY: "investigated-by",
  // Cargo
  DECLARED_ON: "declared-on",
  DOCUMENTED_BY: "documented-by",
  // Container
  ON_VOYAGE: "on-voyage",
  HOLDS: "holds",
  // Document
  BELONGS_TO: "belongs-to",
  DOCUMENTS: "documents",
  // Port
  ORIGIN_OF: "origin-of",
  DESTINATION_OF: "destination-of",
  // Investigation
  TARGETS: "targets",
  HAS_EVIDENCE: "has-evidence",
  PRODUCED: "produced",
  // Evidence
  SUPPORTS: "supports",
  DERIVED_FROM: "derived-from",
  // Report / Agency / Regulation
  REPORTS_ON: "reports-on",
  ISSUED_BY: "issued-by",
  ISSUED: "issued",
  HANDLES: "handles",
  GOVERNS: "governs",
  TRIGGERED_BY: "triggered-by",
} as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES];

export * from "./confidence";
