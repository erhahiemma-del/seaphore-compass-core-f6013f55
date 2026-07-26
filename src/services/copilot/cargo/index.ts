/**
 * SPRINT CAP-04 — Cargo Investigation Copilot.
 *
 * Public surface: prompt routing + dossier construction. The Copilot
 * calls these; nothing here fetches, and no provider-specific logic is
 * permitted in this module.
 */
export * from "./types";
export { extractSubjectTerm, routeCargoQuery, type CargoRoutingOptions } from "./routing";
export {
  buildCargoDossier,
  buildCargoDossierForRoute,
  type BuildCargoDossierInput,
} from "./dossier";
