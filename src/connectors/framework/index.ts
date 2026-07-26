/**
 * Evidence Provider Framework v1.0 — public surface (Sprint PF-01).
 *
 * Import from here, never from the individual files, so the framework can
 * evolve to v1.1 / v2.0 behind a stable entry point.
 */
export {
  EVIDENCE_PROVIDER_SPEC_VERSION,
  SUPPORTED_SPEC_VERSIONS,
  FROZEN_PROVIDER_API,
  APPROVED_LEGACY_API,
  isEvidenceProviderV1,
} from "./spec";
export type {
  EvidenceProviderV1,
  EvidenceProviderSpecVersion,
  ProviderValidation,
} from "./spec";
export {
  certifyProvider,
  formatCertificationReport,
  publicMethodsFromSource,
} from "./certification";
export type {
  CertificationCheck,
  CertificationOptions,
  CertificationReport,
  CheckStatus,
} from "./certification";
export {
  registerCertifiedProvider,
  ProviderCertificationError,
} from "./register";
export type { RegistrarTarget } from "./register";
export { BaseEvidenceProvider } from "./BaseEvidenceProvider";
export type { BaseEvidenceProviderOptions } from "./BaseEvidenceProvider";
