/**
 * Government adapter catalog (Sprint EP-GOV-01).
 *
 * A plain frozen list — deliberately NOT a registry class and holding no
 * state, so the single frozen EvidenceCache remains the only cache in the
 * acquisition path. Adding an authority = adding one entry here.
 */
import { ncsAdapter } from "./ncs";
import { nimasaAdapter } from "./nimasa";
import { npaAdapter } from "./npa";
import type { GovernmentAgencyAdapter, GovernmentAgencyCode } from "../types";

export const GOVERNMENT_ADAPTERS: ReadonlyArray<GovernmentAgencyAdapter> = Object.freeze([
  ncsAdapter,
  nimasaAdapter,
  npaAdapter,
]);

export function findGovernmentAdapter(
  agency: GovernmentAgencyCode,
): GovernmentAgencyAdapter | undefined {
  return GOVERNMENT_ADAPTERS.find((a) => a.agency === agency);
}

export { ncsAdapter, nimasaAdapter, npaAdapter };
