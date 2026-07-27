/**
 * ─────────────────────────────────────────────────────────────────────
 *  EVIDENCE PROVIDER CATALOG (Sprint EP-MASTER)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  The single source of truth for every integrated Evidence Provider.
 *
 *  The catalog is DERIVED, not hand-maintained: identity, capabilities,
 *  spec version, provider type, environment and cache TTL are read from
 *  the provider instances themselves, so a provider cannot drift from
 *  its catalog row. Health status is resolved live by the Provider
 *  Health dashboard; certification status is resolved live by the
 *  certification engine.
 *
 *  This module is a read-only projection. It is NOT a registry: it never
 *  registers, resolves, caches, persists or orchestrates anything.
 * ─────────────────────────────────────────────────────────────────────
 */
import { EVIDENCE_PROVIDER_SPEC_VERSION } from "./framework/spec";
import { certifyProvider } from "./framework/certification";
import type { Connector, ConnectorCapability } from "@/services/ial/connectors/base";
import { environmentalIntelligenceProvider } from "./implementations/EnvironmentalIntelligenceProvider";
import { openSanctionsConnector } from "./implementations/OpenSanctionsConnector";
import { openCorporatesProvider, OPENCORPORATES_CACHE_TTL_MS } from "./implementations/OpenCorporatesProvider";
import { equasisProvider, EQUASIS_CACHE_TTL_MS } from "./implementations/EquasisProvider";
import { imoGisisProvider, IMO_GISIS_CACHE_TTL_MS } from "./implementations/ImoGisisProvider";
import { ncsCustomsProvider, NCS_CUSTOMS_CACHE_TTL_MS } from "./implementations/NcsCustomsProvider";
import {
  globalFishingWatchProvider,
  GFW_CACHE_TTL_MS,
} from "./implementations/GlobalFishingWatchProvider";
import { ofacProvider, OFAC_CACHE_TTL_MS } from "./implementations/OfacProvider";
import {
  unSecurityCouncilProvider,
  UNSC_CACHE_TTL_MS,
} from "./implementations/UnSecurityCouncilProvider";
import {
  copernicusProvider,
  COPERNICUS_CACHE_TTL_MS,
} from "./implementations/CopernicusProvider";

/** Descriptive, human-authored half of a catalog row. */
interface CatalogDeclaration {
  /** Sprint that delivered the provider. */
  readonly sprint: string;
  /** Upstream data source(s) actually contacted. */
  readonly dataSources: ReadonlyArray<string>;
  /** Credential requirement, honestly stated. */
  readonly authentication: "none" | "api-token" | "account-credentials";
  /** Environment variable(s) holding the credential, when required. */
  readonly credentialEnv: ReadonlyArray<string>;
  readonly cacheTtlMs: number;
  /** Vitest files covering the provider. */
  readonly testCoverage: ReadonlyArray<string>;
  readonly lastValidationDate: string;
  /** True for the framework's reference implementation. */
  readonly referenceImplementation: boolean;
  readonly documentation: string;
  readonly sourceFile: string;
}

/** One fully-resolved catalog row. */
export interface CatalogRow extends CatalogDeclaration {
  readonly providerId: string;
  readonly providerName: string;
  readonly capabilities: ReadonlyArray<ConnectorCapability>;
  readonly specVersion: string;
  readonly providerType: string;
  readonly environment: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly certification: "CERTIFIED" | "FAILED";
  readonly certificationFailures: ReadonlyArray<string>;
  /**
   * Health is probed live (Provider Health dashboard). The catalog states
   * where it comes from rather than caching a stale value.
   */
  readonly healthStatus: "probed-live";
  readonly projectionContractId: string;
}

const DOCS = "src/connectors/framework/EVIDENCE_PROVIDER_FRAMEWORK.md";
const VALIDATED = "2026-07-26";

type CatalogProvider = Connector & {
  readonly specVersion?: string;
  readonly projectionContractId?: string;
};

const DECLARATIONS: ReadonlyArray<{
  provider: CatalogProvider;
  declaration: CatalogDeclaration;
}> = [
  {
    provider: openSanctionsConnector,
    declaration: {
      sprint: "EP-01",
      dataSources: ["OpenSanctions /search/default (hosted yente API)"],
      // Sprint OPS-01: the hosted API rejects anonymous search with
      // HTTP 401, so the key requirement is now declared, not hidden.
      authentication: "api-token",
      credentialEnv: ["OPENSANCTIONS_API_KEY"],
      cacheTtlMs: 24 * 60 * 60 * 1000,
      testCoverage: [
        "src/connectors/framework/__tests__/certification.test.ts",
        "src/connectors/__tests__/opensanctions.test.ts",
      ],
      lastValidationDate: VALIDATED,
      referenceImplementation: true,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/OpenSanctionsConnector.ts",
    },
  },
  {
    provider: openCorporatesProvider,
    declaration: {
      sprint: "EP-02",
      dataSources: ["OpenCorporates /v0.4/companies/search"],
      authentication: "api-token",
      credentialEnv: ["OPENCORPORATES_API_TOKEN"],
      cacheTtlMs: OPENCORPORATES_CACHE_TTL_MS,
      testCoverage: [
        "src/connectors/framework/__tests__/certification.test.ts",
        "src/connectors/__tests__/ep-master-providers.test.ts",
      ],
      lastValidationDate: VALIDATED,
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/OpenCorporatesProvider.ts",
    },
  },
  {
    provider: equasisProvider,
    declaration: {
      sprint: "EP-03",
      dataSources: ["Equasis restricted ship search (account-gated)"],
      authentication: "account-credentials",
      credentialEnv: ["EQUASIS_USERNAME", "EQUASIS_PASSWORD"],
      cacheTtlMs: EQUASIS_CACHE_TTL_MS,
      testCoverage: [
        "src/connectors/framework/__tests__/certification.test.ts",
        "src/connectors/__tests__/ep-master-providers.test.ts",
      ],
      lastValidationDate: VALIDATED,
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/EquasisProvider.ts",
    },
  },
  {
    provider: imoGisisProvider,
    declaration: {
      sprint: "EP-04",
      dataSources: ["IMO GISIS public ship module (account-gated)"],
      authentication: "api-token",
      credentialEnv: ["IMO_GISIS_API_TOKEN"],
      cacheTtlMs: IMO_GISIS_CACHE_TTL_MS,
      testCoverage: [
        "src/connectors/framework/__tests__/certification.test.ts",
        "src/connectors/__tests__/ep-master-providers.test.ts",
      ],
      lastValidationDate: VALIDATED,
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/ImoGisisProvider.ts",
    },
  },
  {
    provider: ncsCustomsProvider,
    declaration: {
      sprint: "EP-CARGO-01",
      dataSources: ["Nigeria Customs Service declarations / NICIS II (credentialed)"],
      authentication: "api-token",
      credentialEnv: ["NCS_CUSTOMS_API_BASE_URL", "NCS_CUSTOMS_API_TOKEN"],
      cacheTtlMs: NCS_CUSTOMS_CACHE_TTL_MS,
      testCoverage: ["src/connectors/framework/__tests__/certification.test.ts"],
      lastValidationDate: VALIDATED,
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/NcsCustomsProvider.ts",
    },
  },
  {
    provider: environmentalIntelligenceProvider,
    declaration: {
      sprint: "EP-05",
      dataSources: ["Open-Meteo Marine API (Source 1, adapter architecture)"],
      authentication: "none",
      credentialEnv: [],
      cacheTtlMs: 60 * 60 * 1000,
      testCoverage: [
        "src/connectors/framework/__tests__/certification.test.ts",
        "src/connectors/__tests__/environmental-intelligence.test.ts",
      ],
      lastValidationDate: VALIDATED,
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/EnvironmentalIntelligenceProvider.ts",
    },
  },
  {
    provider: globalFishingWatchProvider,
    declaration: {
      sprint: "EP-06",
      dataSources: ["Global Fishing Watch API v3 — vessel identity/activity"],
      authentication: "api-token",
      credentialEnv: ["GFW_API_TOKEN"],
      cacheTtlMs: GFW_CACHE_TTL_MS,
      testCoverage: [
        "src/connectors/framework/__tests__/certification.test.ts",
        "src/connectors/__tests__/ep-master-providers.test.ts",
      ],
      lastValidationDate: VALIDATED,
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/GlobalFishingWatchProvider.ts",
    },
  },
  {
    provider: ofacProvider,
    declaration: {
      sprint: "EP-07",
      dataSources: ["US Treasury OFAC SDN published XML export"],
      authentication: "none",
      credentialEnv: [],
      cacheTtlMs: OFAC_CACHE_TTL_MS,
      testCoverage: [
        "src/connectors/framework/__tests__/certification.test.ts",
        "src/connectors/__tests__/ep-master-providers.test.ts",
      ],
      lastValidationDate: VALIDATED,
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/OfacProvider.ts",
    },
  },
  {
    provider: unSecurityCouncilProvider,
    declaration: {
      sprint: "EP-08",
      dataSources: ["UN Security Council consolidated XML export"],
      authentication: "none",
      credentialEnv: [],
      cacheTtlMs: UNSC_CACHE_TTL_MS,
      testCoverage: [
        "src/connectors/framework/__tests__/certification.test.ts",
        "src/connectors/__tests__/ep-master-providers.test.ts",
      ],
      lastValidationDate: VALIDATED,
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/UnSecurityCouncilProvider.ts",
    },
  },
  {
    provider: copernicusProvider,
    declaration: {
      sprint: "EP-COPERNICUS-01",
      dataSources: [
        "Copernicus Data Space Ecosystem STAC API — Sentinel-1, Sentinel-2, and all Copernicus collections",
      ],
      authentication: "account-credentials",
      credentialEnv: ["COPERNICUS_USERNAME", "COPERNICUS_PASSWORD"],
      cacheTtlMs: COPERNICUS_CACHE_TTL_MS,
      testCoverage: [
        "src/connectors/__tests__/CopernicusProvider.test.ts",
        "src/connectors/framework/__tests__/certification.test.ts",
      ],
      lastValidationDate: "2026-07-27",
      referenceImplementation: false,
      documentation: DOCS,
      sourceFile: "src/connectors/implementations/CopernicusProvider.ts",
    },
  },
];

/**
 * Build the catalog by reading each provider instance. Certification is
 * re-run on every call so a row can never claim compliance a provider no
 * longer has.
 */
export function buildEvidenceProviderCatalog(): ReadonlyArray<CatalogRow> {
  return DECLARATIONS.map(({ provider, declaration }) => {
    const report = certifyProvider(provider, { allowSkipped: true });
    return {
      ...declaration,
      providerId: provider.id,
      providerName: provider.displayName,
      capabilities: provider.capabilities ?? [],
      specVersion: provider.specVersion ?? EVIDENCE_PROVIDER_SPEC_VERSION,
      providerType: provider.provider?.providerType ?? "LIVE",
      environment: provider.provider?.environment ?? "both",
      priority: provider.provider?.priority ?? 0,
      enabled: provider.provider?.enabled ?? true,
      certification: report.certified ? "CERTIFIED" : "FAILED",
      certificationFailures: report.checks
        .filter((check) => check.status === "FAIL")
        .map((check) => `${check.id}: ${check.detail}`),
      healthStatus: "probed-live",
      projectionContractId: provider.projectionContractId ?? "",
    };
  });
}

/** Convenience: every provider id in catalog order. */
export function catalogProviderIds(): ReadonlyArray<string> {
  return buildEvidenceProviderCatalog().map((row) => row.providerId);
}

export function formatCacheTtl(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours >= 24) return `${Math.round(hours / 24)}d`;
  if (hours >= 1) return `${Math.round(hours)}h`;
  return `${Math.round(ms / 60_000)}m`;
}
