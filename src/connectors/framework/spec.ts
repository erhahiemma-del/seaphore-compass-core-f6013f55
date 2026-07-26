/**
 * ─────────────────────────────────────────────────────────────────────
 *  EVIDENCE PROVIDER SPECIFICATION v1.0  (Sprint PF-01 — FROZEN)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  This file is the permanent contract every Seaphore Evidence Provider
 *  must satisfy (OpenCorporates, Equasis, IMO GISIS, Environmental
 *  Intelligence, OFAC, UN Sanctions, Global Fishing Watch, Datalastic,
 *  MarineTraffic, …).
 *
 *  It adds NO registry, NO cache, NO orchestration. It only *describes*
 *  and *constrains*. Providers keep using the existing framework:
 *    • Connector contract      src/services/ial/connectors/base.ts
 *    • Connector Registry      src/services/ial/connectors/registry.ts
 *    • Provider Resolver       src/services/ial/connectors/resolver.ts
 *    • EvidenceCache           src/services/ial/cache.ts
 *    • normalizeRecord()       src/services/ial/normalizer.ts
 *    • validateRecords()       src/services/ial/validator.ts
 *    • stableHash()            src/services/ial/hash.ts
 *
 *  VERSIONING — every provider declares `specVersion: "1.0"`. Framework
 *  changes ship as v1.1 / v2.0; v1.0 providers keep working unchanged.
 * ─────────────────────────────────────────────────────────────────────
 */
import type { Connector } from "@/services/ial/connectors/base";
import type { NormalizedEvidence, ValidationIssue } from "@/services/ial/types";

/** The frozen specification version. */
export const EVIDENCE_PROVIDER_SPEC_VERSION = "1.0" as const;
export type EvidenceProviderSpecVersion = typeof EVIDENCE_PROVIDER_SPEC_VERSION;

/** Spec versions this framework build can certify. */
export const SUPPORTED_SPEC_VERSIONS: ReadonlyArray<string> = ["1.0"];

/**
 * PART 4 — CONNECTOR API FREEZE.
 *
 * The public Evidence Provider surface. Anything else on a provider must
 * be `private` / `protected` / `#private`, or listed in
 * `APPROVED_LEGACY_API` (framework approval).
 */
export const FROZEN_PROVIDER_API = [
  "connect",
  "healthCheck",
  "search",
  "normalize",
  "validate",
] as const;

/**
 * Pre-approved members that predate the freeze and are required by the
 * existing `Connector` interface. No new entries without framework
 * approval — that is what "frozen" means.
 */
export const APPROVED_LEGACY_API: ReadonlyArray<string> = [
  "constructor",
  "authenticate", // Connector contract
  "lookup", // Connector contract
];

/** Provider validation outcome — thin wrapper over `validateRecords`. */
export interface ProviderValidation {
  readonly issues: ReadonlyArray<ValidationIssue>;
}

/**
 * Evidence Provider Specification v1.0.
 *
 * A provider is a `Connector` (unchanged) plus three declarations that
 * make automatic certification possible.
 */
export interface EvidenceProviderV1 extends Connector {
  /** MUST be "1.0". */
  readonly specVersion: EvidenceProviderSpecVersion;
  /**
   * Id of this provider's entry in the Officer-Facing Projection
   * Contract (`src/lib/projection-contract/registry.ts`). Backend
   * capability with no declared officer projection = Golden Rule
   * violation = failed certification.
   */
  readonly projectionContractId: string;
  /** Record-level validation. Flags, never drops. */
  validate(records: ReadonlyArray<NormalizedEvidence>): ProviderValidation;
}

/** Runtime guard used by the certifier and by registration. */
export function isEvidenceProviderV1(value: unknown): value is EvidenceProviderV1 {
  const p = value as Partial<EvidenceProviderV1> | null;
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.specVersion === "string" &&
    typeof p.validate === "function"
  );
}
