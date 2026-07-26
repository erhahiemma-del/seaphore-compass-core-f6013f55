/**
 * Certified registration — certification gate in front of the EXISTING
 * IAL Connector Registry / ConnectorManager. No new registry is created;
 * this only refuses to call the existing `register()` when a provider
 * fails Evidence Provider Specification v1.0 certification.
 */
import type { Connector } from "@/services/ial/connectors/base";
import {
  certifyProvider,
  formatCertificationReport,
  type CertificationOptions,
  type CertificationReport,
} from "./certification";

export interface RegistrarTarget {
  register(connector: Connector): void;
}

export class ProviderCertificationError extends Error {
  constructor(readonly report: CertificationReport) {
    super(
      `Evidence Provider "${report.providerId}" failed certification:\n${formatCertificationReport(report)}`,
    );
    this.name = "ProviderCertificationError";
  }
}

/**
 * Certify, then register. Failed certification = failed registration.
 */
export function registerCertifiedProvider(
  target: RegistrarTarget,
  provider: Connector,
  opts: CertificationOptions = {},
): CertificationReport {
  const report = certifyProvider(provider, opts);
  if (!report.certified) throw new ProviderCertificationError(report);
  target.register(provider);
  return report;
}
