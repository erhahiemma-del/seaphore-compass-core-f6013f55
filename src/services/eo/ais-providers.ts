/**
 * AIS provider registry.
 *
 * Catalogues the AIS sources Seaphore can use, their activation state,
 * and what each is still waiting for. Mirrors `RiskModuleRegistry` and
 * `LayerRegistry`: it catalogues, it never fetches.
 *
 * ## `PENDING_CREDENTIALS` is not an error
 *
 * Datalastic and SeaVantage are registered and unconfigured. That is the
 * expected state until credentials and official API documentation arrive,
 * and the registry says so rather than reporting a failure. A commercial
 * provider we have not yet contracted is not a broken integration.
 *
 * ## No provider-specific types cross this boundary
 *
 * Every provider normalises to `AisReport`. The correlation engine has
 * never seen a `DatalasticResponse` and never will — which is what makes
 * providers interchangeable and lets two of them disagree without either
 * one being privileged in code.
 */
import type { AisHistoryProvider } from "./ais-history";

/**
 * Activation state of a provider.
 *
 * Separate from health: a provider can be perfectly healthy as software
 * and still be `PENDING_CREDENTIALS`.
 */
export type AisProviderStatus =
  | "CONNECTED"
  /** Registered, awaiting credentials and/or official API documentation. */
  | "PENDING_CREDENTIALS"
  | "NOT_CONFIGURED"
  | "AUTH_REQUIRED"
  | "FAILED"
  | "RATE_LIMITED"
  | "STALE";

/** What a provider is capable of, once activated. */
export interface AisProviderCapabilities {
  readonly currentPosition: boolean;
  readonly historicalPosition: boolean;
  /** Query by area and time window — the capability SAR correlation needs. */
  readonly areaQuery: boolean;
  readonly fleetQuery: boolean;
  readonly vesselMetadata: boolean;
  readonly imoLookup: boolean;
  readonly mmsiLookup: boolean;
}

/**
 * Capabilities nobody has verified.
 *
 * Every field `null` rather than `false`: "we have not checked" and "the
 * provider cannot do this" are different claims, and defaulting to
 * `false` would quietly assert the second.
 */
export type UnverifiedCapabilities = {
  readonly [K in keyof AisProviderCapabilities]: boolean | null;
};

export interface AisProviderEntry {
  readonly providerId: string;
  readonly displayName: string;
  readonly status: AisProviderStatus;
  /** Null until the provider is activated. */
  readonly provider: AisHistoryProvider | null;
  readonly capabilities: UnverifiedCapabilities;
  /** Env var names, never values. Read server-side inside the boundary. */
  readonly credentialEnv: readonly string[];
  readonly documentationUrl: string | null;
  /** What must arrive before this provider can be implemented. */
  readonly blockers: readonly string[];
  readonly notes: readonly string[];
}

const UNVERIFIED: UnverifiedCapabilities = {
  currentPosition: null,
  historicalPosition: null,
  areaQuery: null,
  fleetQuery: null,
  vesselMetadata: null,
  imoLookup: null,
  mmsiLookup: null,
};

/**
 * Datalastic — first provider slated for activation.
 *
 * Registered with no implementation. The repository contains no
 * Datalastic API documentation and no credential, and the only endpoint
 * referenced anywhere is a `/ping` healthcheck. Writing endpoints from
 * memory would mean guessing a commercial API's contract, which produces
 * code that compiles, passes fabricated tests, and fails on first
 * contact.
 */
export const DATALASTIC_ENTRY: AisProviderEntry = {
  providerId: "datalastic",
  displayName: "Datalastic",
  status: "PENDING_CREDENTIALS",
  provider: null,
  capabilities: UNVERIFIED,
  credentialEnv: ["DATALASTIC_API_KEY"],
  documentationUrl: null,
  blockers: [
    "VERIFIED 2026-09: the upgraded DATALASTIC_API_KEY is provisioned server-side; /api/v0/stat reports key_status = Valid and addons = true. Data endpoints now answer HTTP 200: /vessel, /vessel_pro, /vessel_find, /vessel_history, /vessel_inradius, /port_find, /port, /weather. The earlier blanket HTTP 402 was an expired/unentitled key, not a code defect.",
    "The account reports add-ons available, but no add-on endpoint path has been observed answering 200, so no add-on capability (ownership, inspections, casualties, classification) may be claimed until its documented path is verified live.",
    "EO/AIS correlation still has no Datalastic provider implementation in this registry; the live integration is the geospatial VesselSource, not this slot.",
  ],
  notes: [
    "The commercial AIS integration is implemented and wired: src/lib/server/datalastic.server.ts (client, x-api-key, error mapping, caching), src/lib/datalastic.functions.ts (gateway), and src/services/geospatial/sources/datalastic-vessel-source.ts (canonical VesselSource, registered COMMERCIAL).",
    "Area traffic uses /vessel_inradius (centre + radius). /vessel_inarea does not exist on the provider and answered 404.",
    "Provider failures continue to surface as collection gaps or plan limits, never as an empty sea, and no simulated traffic is substituted for them.",
  ],

};

/**
 * SeaVantage — provider slot only.
 *
 * Deliberately thinner than Datalastic: the brief instructs that
 * SeaVantage not be implemented until documentation and access exist, so
 * the entry reserves the slot and records nothing it cannot support.
 */
export const SEAVANTAGE_ENTRY: AisProviderEntry = {
  providerId: "seavantage",
  displayName: "SeaVantage",
  status: "PENDING_CREDENTIALS",
  provider: null,
  capabilities: UNVERIFIED,
  credentialEnv: ["SEAVANTAGE_API_KEY"],
  documentationUrl: null,
  blockers: [
    "No API documentation has been supplied.",
    "No credentials provisioned.",
    "No adapter exists in the repository — this is a reserved slot, not an incomplete implementation.",
  ],
  notes: ["Reserved as an interchangeable provider slot. No code depends on it."],
};

export class AisProviderRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AisProviderRegistryError";
  }
}

export class AisProviderRegistry {
  private readonly entries = new Map<string, AisProviderEntry>();

  register(entry: AisProviderEntry): this {
    if (this.entries.has(entry.providerId)) {
      throw new AisProviderRegistryError(`Provider "${entry.providerId}" is already registered`);
    }
    // A provider cannot claim to be connected without an implementation.
    if (entry.status === "CONNECTED" && !entry.provider) {
      throw new AisProviderRegistryError(
        `Provider "${entry.providerId}" is CONNECTED but carries no implementation`,
      );
    }
    // Nor can it be pending without saying what it is pending on.
    if (entry.status === "PENDING_CREDENTIALS" && entry.blockers.length === 0) {
      throw new AisProviderRegistryError(
        `Provider "${entry.providerId}" is PENDING_CREDENTIALS and must list its blockers`,
      );
    }
    this.entries.set(entry.providerId, entry);
    return this;
  }

  registerAll(entries: readonly AisProviderEntry[]): this {
    for (const entry of entries) this.register(entry);
    return this;
  }

  /** Activate a provider once its implementation exists. */
  activate(providerId: string, provider: AisHistoryProvider): this {
    const entry = this.entries.get(providerId);
    if (!entry) throw new AisProviderRegistryError(`Unknown provider "${providerId}"`);
    this.entries.set(providerId, { ...entry, provider, status: "CONNECTED", blockers: [] });
    return this;
  }

  get(providerId: string): AisProviderEntry | undefined {
    return this.entries.get(providerId);
  }

  /** Every provider, connected ones first. */
  list(): readonly AisProviderEntry[] {
    return [...this.entries.values()].sort((a, b) => {
      if (a.status !== b.status) return a.status === "CONNECTED" ? -1 : 1;
      return a.providerId.localeCompare(b.providerId);
    });
  }

  connected(): readonly AisProviderEntry[] {
    return this.list().filter((entry) => entry.status === "CONNECTED" && entry.provider);
  }

  /** Providers awaiting credentials or documentation. */
  pending(): readonly AisProviderEntry[] {
    return this.list().filter((entry) => entry.status === "PENDING_CREDENTIALS");
  }

  /** True when at least one provider can actually answer a query. */
  hasCoverage(): boolean {
    return this.connected().length > 0;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Officer-facing summary of the AIS picture's availability.
 *
 * Phrased so that "no provider connected" can never be mistaken for "no
 * vessels": the first is a statement about Seaphore, the second about the
 * sea.
 */
export function describeAisAvailability(registry: AisProviderRegistry): string {
  const connected = registry.connected();
  if (connected.length > 0) {
    return `AIS available from ${connected.map((e) => e.displayName).join(", ")}.`;
  }
  const pending = registry.pending();
  if (pending.length > 0) {
    return `No AIS provider is connected. ${pending
      .map((e) => e.displayName)
      .join(
        " and ",
      )} ${pending.length === 1 ? "is" : "are"} registered and awaiting credentials. Absence of AIS reports reflects Seaphore's collection, not the absence of vessels.`;
  }
  return "No AIS provider is registered.";
}

/** Process-wide registry. Both providers registered, neither implemented. */
export const aisProviderRegistry = new AisProviderRegistry().registerAll([
  DATALASTIC_ENTRY,
  SEAVANTAGE_ENTRY,
]);
