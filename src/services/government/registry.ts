/**
 * Government Data Source Registry.
 *
 * The catalogue of Nigerian government sources, their access position and
 * their licensing. Mirrors `LayerRegistry` and `RiskModuleRegistry`: it
 * catalogues, it never fetches.
 *
 * ## A blocked crawler does not deregister a source
 *
 * NPA SHIPPOS is registered at priority 1 with `crawlerAccess: BLOCKED`
 * and `portalAccess: AVAILABLE`. Both are true simultaneously, and
 * removing the source because an automated agent gets a 403 would delete
 * the most valuable entry in the registry on the strength of a fact about
 * our client rather than about their data.
 */
import { type GovernmentDataSource, type GovSourceStatus, type LicenseTerms } from "./types";

export class GovernmentRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GovernmentRegistryError";
  }
}

/** Licence position when nobody has read the terms. Blocks commercial use. */
export const LICENSE_UNREVIEWED: LicenseTerms = {
  license: null,
  commercialUse: null,
  storageAllowed: null,
  redistributionAllowed: null,
  displayAllowed: null,
  derivedDataAllowed: null,
  retention: null,
  reviewRequired: true,
};

export class GovernmentDataSourceRegistry {
  private readonly sources = new Map<string, GovernmentDataSource>();

  register(source: GovernmentDataSource): this {
    if (this.sources.has(source.sourceId)) {
      throw new GovernmentRegistryError(`Source "${source.sourceId}" is already registered`);
    }
    // A source claiming a verified status must say how it was verified.
    if (
      (source.status === "EXPORT_CONNECTED" || source.status === "API_CONNECTED") &&
      source.automatedIntegration !== "CONNECTED"
    ) {
      throw new GovernmentRegistryError(
        `Source "${source.sourceId}" claims ${source.status} but automatedIntegration is ${source.automatedIntegration}`,
      );
    }
    this.sources.set(source.sourceId, source);
    return this;
  }

  registerAll(sources: readonly GovernmentDataSource[]): this {
    for (const source of sources) this.register(source);
    return this;
  }

  get(sourceId: string): GovernmentDataSource | undefined {
    return this.sources.get(sourceId);
  }

  has(sourceId: string): boolean {
    return this.sources.has(sourceId);
  }

  /** Every source, by priority then agency. */
  list(): readonly GovernmentDataSource[] {
    return [...this.sources.values()].sort(
      (a, b) => a.priority - b.priority || a.agency.localeCompare(b.agency),
    );
  }

  byStatus(status: GovSourceStatus): readonly GovernmentDataSource[] {
    return this.list().filter((source) => source.status === status);
  }

  /** Sources an agreement could unlock. The NPA workstream's queue. */
  awaitingAuthorization(): readonly GovernmentDataSource[] {
    return this.list().filter(
      (source) =>
        source.automatedIntegration === "REQUIRES_AUTHORIZATION" ||
        source.status === "AUTHORIZATION_REQUIRED",
    );
  }

  /** Sources that can be built against today. */
  connectable(): readonly GovernmentDataSource[] {
    return this.list().filter(
      (source) =>
        source.automatedIntegration === "CONNECTED" ||
        source.automatedIntegration === "PENDING_VERIFICATION",
    );
  }

  /** Sources whose terms nobody has read. Must not feed commercial output. */
  licenseReview(): readonly GovernmentDataSource[] {
    return this.list().filter((source) => source.license.reviewRequired);
  }

  clear(): void {
    this.sources.clear();
  }
}

/* ─────────────────────────── NPA SHIPPOS ─────────────────────────── */

/**
 * Datasets the SHIPPOS public page presents.
 *
 * `fieldsBasis: "OPERATOR_SUPPLIED"` throughout. These field lists were
 * described by the platform operator, not parsed by Seaphore off the
 * wire, and the distinction matters: the adapter validates against them
 * but must not assume them. A schema check on first successful fetch is
 * what promotes them to MACHINE_VERIFIED.
 */
const NPA_DATASETS = [
  {
    datasetId: "npa.vessels-expected",
    name: "Daily Shipping Schedule — Vessels Expected",
    dataClass: "DAILY" as const,
    fields: ["vessel", "imo_number", "terminal", "eta", "length", "agent", "cargo", "tonnage"],
    fieldsBasis: "OPERATOR_SUPPLIED" as const,
    historicalCapability: null,
    historicalDepth: null,
    refreshInterval: null,
  },
  {
    datasetId: "npa.awaiting-berth",
    name: "Vessels Awaiting Berth",
    dataClass: "OPERATIONAL" as const,
    fields: ["vessel", "imo_number", "location", "arrival_date", "agent", "cargo", "tonnage"],
    fieldsBasis: "OPERATOR_SUPPLIED" as const,
    historicalCapability: null,
    historicalDepth: null,
    refreshInterval: null,
  },
  {
    datasetId: "npa.at-berth",
    name: "Vessels at Berth",
    dataClass: "OPERATIONAL" as const,
    fields: [
      "vessel",
      "imo_number",
      "terminal",
      "berth",
      "berth_date",
      "arrival_date",
      "agent",
      "commodity",
      "tonnage",
    ],
    fieldsBasis: "OPERATOR_SUPPLIED" as const,
    historicalCapability: null,
    historicalDepth: null,
    refreshInterval: null,
  },
  {
    datasetId: "npa.departed",
    name: "Departed Vessels",
    dataClass: "OPERATIONAL" as const,
    fields: [
      "vessel",
      "imo_number",
      "terminal",
      "berth",
      "etd",
      "rotation",
      "ship_to_follow",
      "agent",
      "commodity",
    ],
    fieldsBasis: "OPERATOR_SUPPLIED" as const,
    historicalCapability: null,
    historicalDepth: null,
    refreshInterval: null,
  },
];

/**
 * NPA SHIPPOS — priority 1.
 *
 * The access position, recorded without flattening:
 *
 *   crawler access        BLOCKED         (HTTP 403; robots.txt disallows AI agents)
 *   public portal         AVAILABLE       (operator-confirmed; a person can read it)
 *   public export         PENDING          ("Export data using the buttons below")
 *   official API          UNKNOWN          (no documentation located)
 *   institutional route   POSSIBLE         (requires NPA authorization)
 *
 * None of those five contradicts the others.
 */
export const NPA_SHIPPOS: GovernmentDataSource = {
  sourceId: "npa-shippos",
  agency: "Nigerian Ports Authority",
  officialName: "Nigerian Ports Authority",
  systemName: "SHIPPOS — Daily Shipping Position v2",

  officialUrl: "https://shippos.nigerianports.gov.ng/",
  documentationUrl: null,
  apiUrl: null,
  portalUrl: "https://shippos.nigerianports.gov.ng/",

  datasets: NPA_DATASETS,
  category: "Port operations",
  accessMethod: "OFFICIAL_EXPORT",
  authentication: "Public portal; SHIPPOS also exposes a /login route for authenticated use.",

  status: "AUTHORIZATION_REQUIRED",

  crawlerAccess: "BLOCKED",
  portalAccess: "AVAILABLE",
  automatedIntegration: "PENDING_VERIFICATION",
  institutionalIntegration: "REQUIRES_AUTHORIZATION",

  liveCapability: null,
  historicalCapability: null,
  geographicCoverage: "Nigerian ports — Lagos (Apapa, Tin Can), Lekki, Rivers, Delta, Calabar",
  dataFormat: ["HTML", "EXPORT_FORMAT_UNVERIFIED"],
  license: LICENSE_UNREVIEWED,
  contact: null,
  priority: 1,
  integrationMethod: ["PUBLIC_EXPORT", "OFFICIAL_API", "AUTHORIZED_INSTITUTIONAL_FEED"],

  notes: [
    "Public portal presents Vessels Expected, Awaiting Berth, At Berth and Departed, with an on-page control described as 'Export data using the buttons below'.",
    "Crawler access is BLOCKED: shippos.nigerianports.gov.ng returns HTTP 403 to automated requests, and nigerianports.gov.ng/robots.txt disallows ClaudeBot, GPTBot, CCBot, Google-Extended and others, signalling ai-train=no, use=reference.",
    "That block is a constraint on automated agents, not evidence that the data cannot be integrated. The source is retained at priority 1.",
    "NPA_API_DOCUMENTATION_NOT_FOUND — no developer documentation, API reference or data-service page was located through permitted search.",
    "Dataset field lists are OPERATOR_SUPPLIED and unverified against the wire. The adapter validates against them; first successful fetch should promote them to MACHINE_VERIFIED.",
    "Export URL, HTTP method, parameters, format, rate limits and terms are all UNVERIFIED. The adapter therefore ships unconfigured and returns no records.",
    "Historical Daily Shipping Position documents are observable as PDFs under nigerianports.gov.ng/wp-content/uploads/ (e.g. 2017, 2018), indicating historical depth exists; systematic retrieval requires authorization.",
    "Production route, in priority order: public export → official API → official feed → authorized institutional feed. Scraping is not a production route.",
  ],

  lastChecked: null,
  lastSync: null,
  lastError: null,
};

/* ─────────────────────────── NOSDRA ─────────────────────────── */

/** The one source verified reachable without authentication. */
export const NOSDRA_OIL_SPILL: GovernmentDataSource = {
  sourceId: "nosdra-oil-spill-monitor",
  agency: "National Oil Spill Detection and Response Agency",
  officialName: "NOSDRA",
  systemName: "Nigerian Oil Spill Monitor",

  officialUrl: "https://oilspillmonitor.ng/",
  documentationUrl: null,
  apiUrl: null,
  portalUrl: "https://oilspillmonitor.ng/",

  datasets: [
    {
      datasetId: "nosdra.incidents",
      name: "Oil spill incidents",
      dataClass: "PERIODIC",
      fields: ["latitude", "longitude", "incident_date", "operator", "volume"],
      fieldsBasis: "MACHINE_VERIFIED",
      historicalCapability: true,
      historicalDepth: null,
      refreshInterval: null,
    },
  ],
  category: "Environmental",
  accessMethod: "OFFICIAL_EXPORT",
  authentication: null,

  status: "PUBLIC",

  crawlerAccess: "ALLOWED",
  portalAccess: "AVAILABLE",
  automatedIntegration: "PENDING_VERIFICATION",
  institutionalIntegration: "UNKNOWN",

  liveCapability: false,
  historicalCapability: true,
  geographicCoverage: "Nigeria — Niger Delta and coastal states",
  dataFormat: ["CSV", "JSON", "GeoJSON"],
  license: LICENSE_UNREVIEWED,
  contact: "oilspillalerts@nosdra.gov.ng",
  priority: 2,
  integrationMethod: ["PUBLIC_EXPORT"],

  notes: [
    "Verified: public, no authentication, offering 'Download filtered data as CSV' and 'Download complete dataset as JSON'.",
    "Georeferenced layers observed: oil blocks, pipelines, terminals, wetlands, waterbodies, population.",
    "Exact export URLs still to be captured; licence terms unread, so LICENSE_REVIEW blocks commercial use.",
    "Not live. Classified PERIODIC — an incident register, not a feed.",
  ],

  lastChecked: null,
  lastSync: null,
  lastError: null,
};

/** Process-wide registry. Construct a fresh one in tests. */
export const governmentRegistry = new GovernmentDataSourceRegistry().registerAll([
  NPA_SHIPPOS,
  NOSDRA_OIL_SPILL,
]);
