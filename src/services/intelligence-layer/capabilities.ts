/**
 * What Seaphore can be asked, independently of who answers.
 *
 * The Copilot must not know that positions come from a simulated
 * provider today and might come from Datalastic tomorrow, or that
 * ownership will arrive from a registry that is not yet connected. It
 * asks for vessel intelligence; this layer decides where that comes from
 * — or says, precisely, that nothing can answer.
 *
 * ## Why this exists before the providers do
 *
 * Without a seam, every new API acquires its own search, its own entity
 * resolution and its own path to the screen, and the assistant has to be
 * retrofitted across all of them afterwards. The interface is therefore
 * written first and deliberately: adding a provider becomes implementing
 * a capability, not building a feature.
 *
 * ## Unavailable is a first-class answer
 *
 * Every capability can return `UNAVAILABLE` with a reason, and the
 * reason distinguishes the two cases an officer must never confuse: no
 * provider is connected for this at all, or a provider is connected and
 * holds nothing for this subject. A layer that returned an empty list
 * for both would quietly teach an officer that Seaphore had checked.
 */

/** Every question the layer can be asked. Extended, never branched on. */
export type CapabilityId =
  | "vessel.positions"
  | "vessel.identity"
  | "vessel.track"
  | "vessel.approach"
  | "vessel.ownership"
  | "vessel.crew"
  | "vessel.voyage"
  | "vessel.cargo"
  | "vessel.compliance"
  | "vessel.risk"
  | "port.activity"
  | "company.profile";

export type Availability =
  /** A provider is connected and answered. */
  | "AVAILABLE"
  /** No provider is connected for this capability anywhere. */
  | "NOT_CONNECTED"
  /** A provider is connected but holds nothing for this subject. */
  | "NO_RECORD"
  /** A provider is connected and failed. Distinct from having no data. */
  | "PROVIDER_ERROR";

export interface Answer<T> {
  readonly availability: Availability;
  readonly value?: T;
  /** Why there is no value. Required whenever `value` is absent. */
  readonly reason?: string;
  /**
   * Who answered, and how much the answer is worth.
   *
   * Carried on every result rather than looked up later, because a
   * value that arrives without its provenance is a value some component
   * downstream will eventually present as fact.
   */
  readonly provenance?: Provenance;
}

export interface Provenance {
  readonly providerId: string;
  readonly providerLabel: string;
  /** Whether the provider observes the world or generates it. */
  readonly kind: "OBSERVED" | "DERIVED" | "ESTIMATED" | "SIMULATED";
  readonly retrievedAt: string;
  /** A limitation that must travel with the value. */
  readonly caveat?: string;
}

/** A provider's claim to answer one capability. */
export interface CapabilityProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly CapabilityId[];
}

/**
 * Say plainly that nothing is connected.
 *
 * The default answer for every capability, so a capability nobody has
 * implemented yet cannot silently return an empty success.
 */
export function notConnected<T>(capability: CapabilityId): Answer<T> {
  return {
    availability: "NOT_CONNECTED",
    reason: `No provider is connected for ${DESCRIPTION[capability]}.`,
  };
}

export function available<T>(value: T, provenance: Provenance): Answer<T> {
  return { availability: "AVAILABLE", value, provenance };
}

export function noRecord<T>(reason: string, provenance?: Provenance): Answer<T> {
  return { availability: "NO_RECORD", reason, provenance };
}

/**
 * Officer-facing description of each capability.
 *
 * Used in the sentence an officer reads when something is unavailable,
 * so the wording is written once here rather than improvised at each
 * call site.
 */
const DESCRIPTION: Readonly<Record<CapabilityId, string>> = {
  "vessel.positions": "live vessel positions",
  "vessel.identity": "vessel identity and registry details",
  "vessel.track": "vessel movement history",
  "vessel.approach": "approach assessment against Nigerian waters",
  "vessel.ownership": "vessel ownership and operator intelligence",
  "vessel.crew": "crew and master records",
  "vessel.voyage": "voyage, origin and port-call history",
  "vessel.cargo": "cargo and manifest intelligence",
  "vessel.compliance": "compliance, inspection and sanctions history",
  "vessel.risk": "risk scoring and intelligence signals",
  "port.activity": "port call and dwell-time activity",
  "company.profile": "company and corporate structure intelligence",
};

export function describeCapability(capability: CapabilityId): string {
  return DESCRIPTION[capability];
}

/* ── Registry ────────────────────────────────────────────────────────── */

const providers = new Map<CapabilityId, CapabilityProvider>();

/**
 * Claim a capability for a provider.
 *
 * One provider per capability, deliberately. Merging two sources for the
 * same question is a real design problem — precedence, conflict,
 * disagreement — and pretending it is solved by registration order would
 * put the resolution somewhere nobody can see it.
 */
export function registerCapability(capability: CapabilityId, provider: CapabilityProvider): void {
  providers.set(capability, provider);
}

export function providerFor(capability: CapabilityId): CapabilityProvider | null {
  return providers.get(capability) ?? null;
}

export function isConnected(capability: CapabilityId): boolean {
  return providers.has(capability);
}

/**
 * What Seaphore can and cannot answer right now.
 *
 * The executable form of the capability matrix an audit would otherwise
 * produce by hand and then let go stale.
 */
export function capabilityMatrix(): readonly {
  readonly capability: CapabilityId;
  readonly description: string;
  readonly connected: boolean;
  readonly provider?: string;
}[] {
  return (Object.keys(DESCRIPTION) as CapabilityId[]).map((capability) => {
    const provider = providers.get(capability);
    return {
      capability,
      description: DESCRIPTION[capability],
      connected: provider != null,
      provider: provider?.label,
    };
  });
}

/** Test seam. Never called by application code. */
export function resetCapabilities(): void {
  providers.clear();
}
