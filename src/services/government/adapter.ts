/**
 * GovernmentDataAdapter — the shared contract for government sources.
 *
 * ## Acquisition is route-ordered, and scraping is not a route
 *
 * Every adapter declares which of the four sanctioned routes it can use:
 *
 *   PUBLIC_EXPORT → OFFICIAL_API → OFFICIAL_FEED → AUTHORIZED_INSTITUTIONAL_FEED
 *
 * and tries them in that order. HTML scraping is deliberately absent. It
 * is brittle, it breaks silently on redesign, and where a site blocks
 * automated agents it is also a circumvention of a stated control. An
 * adapter with no configured route returns no records and says why.
 *
 * ## The unconfigured state is a first-class state
 *
 * `NOT_CONFIGURED` is not an error. Most government sources will sit
 * there for months while agreements are negotiated, and an officer must
 * be able to tell "we have no data because nobody has granted access"
 * apart from "we checked and there was nothing".
 */
import type { AcquisitionRoute, GovernmentDataSource, SourceHealth } from "./source-registry";

/** Result of one acquisition attempt. Never throws to the caller. */
export interface FetchResult<T> {
  readonly sourceId: string;
  readonly datasetId: string;
  readonly records: readonly T[];
  /** Which route produced these records. Null when none succeeded. */
  readonly route: AcquisitionRoute | null;
  readonly health: SourceHealth;
  /** Populated whenever `records` is empty for any reason but "no data". */
  readonly unavailableReason: string | null;
  /** When the upstream says the data was true. Null when it does not say. */
  readonly sourceTimestamp: string | null;
  readonly retrievedAt: string;
  readonly durationMs: number;
}

/** Configuration for one sanctioned route. Supplied at deployment. */
export interface RouteConfig {
  readonly route: AcquisitionRoute;
  /** Endpoint or export URL. Absent means the route is not configured. */
  readonly url?: string;
  readonly method?: "GET" | "POST";
  readonly params?: Readonly<Record<string, string>>;
  readonly format?: "CSV" | "JSON" | "XLSX" | "XML" | "GeoJSON";
  /**
   * Credential env var name, never the credential. Adapters read it
   * server-side, inside the execution boundary.
   */
  readonly credentialEnv?: string;
}

export interface DiscoveryReport {
  readonly sourceId: string;
  /** Routes with configuration present. */
  readonly configuredRoutes: readonly AcquisitionRoute[];
  /** Routes the source could support but which are unconfigured. */
  readonly unconfiguredRoutes: readonly AcquisitionRoute[];
  readonly notes: readonly string[];
}

/**
 * The contract every government adapter implements.
 *
 * Deliberately narrower than "fetch anything": each method names a
 * dataset, so the registry, the health surface and the Control Centre can
 * report per-dataset rather than per-agency.
 */
export interface GovernmentDataAdapter<T = unknown> {
  readonly sourceId: string;
  readonly source: GovernmentDataSource;

  healthCheck(): Promise<{ health: SourceHealth; detail: string }>;
  /** Which routes are configured. Never probes a blocked endpoint. */
  discover(): DiscoveryReport;
  fetch(datasetId: string): Promise<FetchResult<T>>;
  fetchIncremental(datasetId: string, sinceIso: string): Promise<FetchResult<T>>;
  fetchHistorical(datasetId: string, fromIso: string, toIso: string): Promise<FetchResult<T>>;
  fetchExport(datasetId: string): Promise<FetchResult<T>>;
  normalize(raw: unknown, datasetId: string): readonly T[];
  validate(records: readonly T[]): {
    readonly valid: readonly T[];
    readonly rejected: readonly { record: T; reason: string }[];
  };
  deduplicate(records: readonly T[]): readonly T[];
  getMetadata(): GovernmentDataSource;
  getStatus(): SourceHealth;
}

/**
 * Build the result an adapter returns when no route is configured.
 *
 * Shared so the shape of "we have no access" is identical everywhere, and
 * so no adapter is tempted to return an empty array that reads as "no
 * vessels expected today".
 */
export function notConfigured<T>(
  sourceId: string,
  datasetId: string,
  reason: string,
  startedMs: number = Date.now(),
): FetchResult<T> {
  return {
    sourceId,
    datasetId,
    records: [],
    route: null,
    health: "NOT_CONFIGURED",
    unavailableReason: reason,
    sourceTimestamp: null,
    retrievedAt: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - startedMs),
  };
}

/** The first configured route, in sanctioned priority order. */
export function selectRoute(
  configs: readonly RouteConfig[],
  allowed: readonly AcquisitionRoute[],
): RouteConfig | null {
  for (const route of allowed) {
    const config = configs.find((c) => c.route === route && c.url);
    if (config) return config;
  }
  return null;
}
