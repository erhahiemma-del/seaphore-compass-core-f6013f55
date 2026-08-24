/**
 * Government Data Source Registry — canonical types.
 *
 * ## Why a source stays registered even when we cannot reach it
 *
 * A crawler being blocked is a fact about the crawler, not a verdict on
 * the source. NPA SHIPPOS publishes operational port data and is the
 * single highest-value government source in the programme; the fact that
 * an automated agent receives HTTP 403 says only that automated agents
 * are not the intended client.
 *
 * So the registry separates three questions that are easy to collapse
 * and expensive to confuse:
 *
 *   crawlerAccess        — can an automated agent fetch it right now?
 *   publicPortalAccess   — can a person open it in a browser?
 *   automatedIntegration — is there a sanctioned machine-readable path?
 *
 * A source can be BLOCKED to crawlers, AVAILABLE to the public, and
 * PENDING_VERIFICATION for integration all at once. Flattening those into
 * one "status" is what produces the wrong conclusion — either "we have
 * it" or "it is unavailable", when the truth is "it is reachable through
 * a route we have not yet established".
 */

/** Lifecycle of a source in the registry. */
export type GovSourceStatus =
  | "DISCOVERED"
  | "PUBLIC"
  | "API_AVAILABLE"
  | "API_CONNECTED"
  | "PORTAL_CONNECTED"
  | "EXPORT_CONNECTED"
  | "GIS_CONNECTED"
  | "AUTHORIZATION_REQUIRED"
  | "CREDENTIALS_REQUIRED"
  | "LICENSE_REVIEW"
  | "NOT_AVAILABLE"
  | "UNVERIFIED"
  | "DEPRECATED";

/** How the data is technically reached. */
export type AccessMethod =
  | "OFFICIAL_API"
  | "PUBLIC_API"
  | "PUBLIC_PORTAL"
  | "OFFICIAL_EXPORT"
  | "GIS_SERVICE"
  | "DOWNLOAD"
  | "DOCUMENT"
  | "AUTHENTICATED_API"
  | "INSTITUTIONAL_FEED"
  | "MANUAL_UPLOAD"
  | "UNAVAILABLE";

/** How often the data actually changes. Never `LIVE` without verification. */
export type DataClass =
  | "LIVE"
  | "NEAR_REAL_TIME"
  | "OPERATIONAL"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "PERIODIC"
  | "HISTORICAL"
  | "STATIC_REFERENCE"
  | "DOCUMENT";

/** Whether an automated agent can currently retrieve the source. */
export type CrawlerAccess = "ALLOWED" | "BLOCKED" | "RATE_LIMITED" | "UNKNOWN";

/** Whether a person can open the source in a browser without credentials. */
export type PortalAccess = "AVAILABLE" | "LOGIN_REQUIRED" | "UNAVAILABLE" | "UNKNOWN";

/** Whether a sanctioned machine-readable path has been established. */
export type IntegrationReadiness =
  /** Verified and wired. */
  | "CONNECTED"
  /** A mechanism is documented or observed but not yet confirmed by us. */
  | "PENDING_VERIFICATION"
  /** Requires an agreement or credentials from the agency. */
  | "REQUIRES_AUTHORIZATION"
  /** Investigated and none exists. */
  | "NONE_AVAILABLE"
  | "UNKNOWN";

/**
 * Acquisition routes, in the order the adapter must try them.
 *
 * The order is the architecture: a public export is preferable to an API
 * because it is what the operator publishes for reuse; scraping is absent
 * from this list on purpose, because it is not a production route.
 */
export type AcquisitionRoute =
  | "PUBLIC_EXPORT"
  | "OFFICIAL_API"
  | "OFFICIAL_FEED"
  | "AUTHORIZED_INSTITUTIONAL_FEED";

export const ACQUISITION_PRIORITY: readonly AcquisitionRoute[] = [
  "PUBLIC_EXPORT",
  "OFFICIAL_API",
  "OFFICIAL_FEED",
  "AUTHORIZED_INSTITUTIONAL_FEED",
] as const;

/**
 * How a claim in this registry was established.
 *
 * Recorded per source because the registry mixes things we proved with
 * things we were told, and an operator-supplied field list must never
 * read as a verified schema.
 */
export type EvidenceBasis =
  /** Retrieved and inspected by Seaphore. */
  | "MACHINE_VERIFIED"
  /** Described by the platform operator or agency. Credible, unproven. */
  | "OPERATOR_SUPPLIED"
  /** From published documentation. */
  | "DOCUMENTED"
  /** Inferred from search results or secondary sources. */
  | "SECONDARY_SOURCE"
  /** Not established. */
  | "UNVERIFIED";

/** Licensing position. Publicly downloadable is not commercially reusable. */
export interface LicenseTerms {
  readonly license: string | null;
  readonly commercialUse: boolean | null;
  readonly storageAllowed: boolean | null;
  readonly redistributionAllowed: boolean | null;
  readonly displayAllowed: boolean | null;
  readonly derivedDataAllowed: boolean | null;
  readonly retention: string | null;
  /** True when the terms have not been read. Blocks commercial use. */
  readonly reviewRequired: boolean;
}

/** One dataset offered by a government system. */
export interface GovDataset {
  readonly datasetId: string;
  readonly name: string;
  readonly dataClass: DataClass;
  /**
   * Fields the dataset carries.
   *
   * Paired with `fieldsBasis` so a list supplied by an operator is never
   * mistaken for one we parsed off the wire.
   */
  readonly fields: readonly string[];
  readonly fieldsBasis: EvidenceBasis;
  readonly historicalCapability: boolean | null;
  readonly historicalDepth: string | null;
  readonly refreshInterval: string | null;
}

/** A registered government data source. */
export interface GovernmentDataSource {
  readonly sourceId: string;
  readonly agency: string;
  readonly officialName: string;
  readonly systemName: string;

  readonly officialUrl: string;
  readonly documentationUrl: string | null;
  readonly apiUrl: string | null;
  readonly portalUrl: string | null;

  readonly datasets: readonly GovDataset[];
  readonly category: string;
  readonly accessMethod: AccessMethod;
  readonly authentication: string | null;

  readonly status: GovSourceStatus;

  /** The three separated access questions. See the module header. */
  readonly crawlerAccess: CrawlerAccess;
  readonly portalAccess: PortalAccess;
  readonly automatedIntegration: IntegrationReadiness;
  /** Whether an agreement could unlock it. Absence of a route is not a dead end. */
  readonly institutionalIntegration: IntegrationReadiness;

  readonly liveCapability: boolean | null;
  readonly historicalCapability: boolean | null;
  readonly geographicCoverage: string;
  readonly dataFormat: readonly string[];
  readonly license: LicenseTerms;
  readonly contact: string | null;
  /** 1 = highest. Mirrors the brief's priority matrix. */
  readonly priority: 1 | 2 | 3 | 4 | 5;
  readonly integrationMethod: readonly AcquisitionRoute[];

  /**
   * Why this source reads the way it does — including what we were unable
   * to check and why. Rendered in the Control Centre, so an officer never
   * sees a status without its reasoning.
   */
  readonly notes: readonly string[];

  readonly lastChecked: string | null;
  readonly lastSync: string | null;
  readonly lastError: string | null;
}

/** Operational health, distinct from registry status. */
export type SourceHealth =
  | "UP"
  | "DOWN"
  | "DEGRADED"
  | "STALE"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "SCHEMA_CHANGED"
  | "NOT_CONFIGURED"
  | "LICENSE_REVIEW";
