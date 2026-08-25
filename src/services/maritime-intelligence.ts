/**
 * Maritime intelligence broker — the application's front door.
 *
 * Seaphore already had the parts: adapter contracts in `src/adapters`,
 * a data source matrix, an AIS provider registry, two fusion engines, an
 * identity scoring model. What it did not have was a single place to ask
 * a question. A feature wanting a vessel's position had to know which of
 * three registries held the answer, and therefore had to know something
 * about providers — which is exactly what the adapter layer exists to
 * prevent.
 *
 * This module is that place, and *only* that place. It owns no data
 * model, no scoring, no normalisation and no registry of its own:
 *
 *   identity        `intelligence/matching/vessel-identity.ts`
 *   capability      `adapters/matrix.ts`, `services/eo/ais-providers.ts`
 *   availability    `adapters/availability.ts`
 *   evidence        `services/fusion/types.ts`
 *   scoring/fusion  `services/fusion/*`
 *
 * If this file ever grows a type that describes an observation, a
 * provider or a confidence level, that type belongs somewhere else and
 * has been duplicated.
 *
 * ## Absence is an answer
 *
 * Every method returns a result that distinguishes four things which a
 * single empty array would collapse:
 *
 *   `unsupported`     no provider claims this capability at all
 *   `unavailable`     providers exist but none can be queried right now
 *   `empty`           providers were queried and reported nothing
 *   `ready`           providers answered with evidence
 *
 * "No vessels in this area" and "no AIS provider is connected" are
 * different facts about the world, and an officer must never see the
 * second rendered as the first.
 *
 * ## Nothing here calls a live API
 *
 * M2.8 is infrastructure. No provider is connected, so `queryable()` is
 * empty in practice and every intelligence call returns `unsupported` or
 * `unavailable` with the underlying reason attached. That is the honest
 * state, and it is what the tests assert.
 */
import {
  fromAisProviderStatus,
  fromSourceStatus,
  isQueryable,
  type AvailabilityReading,
} from "@/adapters/availability";
import { DATA_SOURCE_MATRIX } from "@/adapters/matrix";
import type { SourceKind } from "@/adapters/status";
import { aisProviderRegistry } from "@/services/eo/ais-providers";
import { detectConflicts } from "@/services/fusion/conflicts";
import { scoreAll } from "@/services/fusion/confidence";
import type { EvidenceConflict, NormalizedEvidence, ScoredEvidence } from "@/services/fusion/types";
import { vesselIdentityIndex, type CanonicalVessel } from "@/intelligence/matching/vessel-identity";

/* ── Availability ─────────────────────────────────────────────── */

/** A provider as the broker sees it, with its own status preserved. */
export interface ProviderAvailabilityEntry {
  readonly providerId: string;
  readonly displayName: string;
  /** Which intelligence domain this provider serves. */
  readonly kind: SourceKind | "ais";
  readonly reading: AvailabilityReading;
}

/**
 * Every provider Seaphore knows about, from both registries.
 *
 * The AIS registry is consulted *in addition to* the matrix rather than
 * instead of it: the matrix knows about trade, sanctions and reference
 * sources the AIS registry has never heard of, and the AIS registry
 * carries capability detail and blockers the matrix does not. Neither is
 * a superset, which is why the union is taken here rather than one being
 * declared canonical.
 */
export function getProviderAvailability(): readonly ProviderAvailabilityEntry[] {
  const entries: ProviderAvailabilityEntry[] = DATA_SOURCE_MATRIX.map((source) => ({
    providerId: source.id,
    displayName: source.provider,
    kind: source.kind,
    reading: fromSourceStatus(source.status),
  }));

  const seen = new Set(entries.map((e) => e.providerId));
  for (const entry of aisProviderRegistry.list()) {
    /*
     * The AIS registry's reading wins where both know a provider.
     *
     * It is the more specific source: `PENDING_CREDENTIALS` says what is
     * missing, where the matrix can only say `PLANNED`. Replacing rather
     * than appending also stops one provider appearing twice.
     */
    const existing = entries.findIndex((e) => e.providerId === entry.providerId);
    const translated: ProviderAvailabilityEntry = {
      providerId: entry.providerId,
      displayName: entry.displayName,
      kind: "ais",
      reading: fromAisProviderStatus(entry.status),
    };
    if (existing >= 0) entries[existing] = translated;
    else if (!seen.has(entry.providerId)) entries.push(translated);
  }

  return Object.freeze(entries);
}

/** Providers worth issuing a request to, optionally narrowed by domain. */
export function queryableProviders(
  kind?: SourceKind | "ais",
): readonly ProviderAvailabilityEntry[] {
  return Object.freeze(
    getProviderAvailability().filter(
      (entry) => isQueryable(entry.reading) && (kind === undefined || entry.kind === kind),
    ),
  );
}

/* ── Intelligence results ─────────────────────────────────────── */

/**
 * Why a request returned nothing, when it did.
 *
 * The four states this module exists to keep apart. `ready` is the only
 * one carrying evidence; the other three each mean something different
 * and none of them means "there is nothing there".
 */
export type IntelligenceState = "unsupported" | "unavailable" | "empty" | "ready";

export interface IntelligenceResult {
  readonly state: IntelligenceState;
  /** The attribute that was asked about, e.g. `vessel.position`. */
  readonly attribute: string;
  /** Canonical subject, when identity resolved. Null when it did not. */
  readonly vessel: CanonicalVessel | null;
  /** Scored evidence, best first. Empty unless `state` is `ready`. */
  readonly evidence: readonly ScoredEvidence[];
  /** Contradictions found. Both sides are preserved — never one silently dropped. */
  readonly conflicts: readonly EvidenceConflict[];
  /** Providers consulted, with their availability at the time. */
  readonly providers: readonly ProviderAvailabilityEntry[];
  /** Officer-facing sentence. Never blank, including when `state` is `ready`. */
  readonly reason: string;
}

function result(
  partial: Omit<IntelligenceResult, "evidence" | "conflicts"> &
    Partial<Pick<IntelligenceResult, "evidence" | "conflicts">>,
): IntelligenceResult {
  return Object.freeze({
    evidence: Object.freeze([]),
    conflicts: Object.freeze([]),
    ...partial,
  });
}

/**
 * Which provider kinds can speak to an attribute.
 *
 * The broker's only piece of routing knowledge, and deliberately coarse:
 * it decides who is *asked*, never who is believed. How much a given
 * source's answer counts is `ATTRIBUTE_AUTHORITY`'s decision, in the
 * fusion layer, where it can be weighed against freshness and grade.
 *
 * An attribute absent from this map is `unsupported` rather than
 * broadcast to everyone — asking a weather provider about a sanctions
 * designation is not a harmless default.
 */
const ATTRIBUTE_PROVIDER_KINDS: Readonly<Record<string, readonly (SourceKind | "ais")[]>> =
  Object.freeze({
    "vessel.position": ["ais"],
    "vessel.track": ["ais", "ais_history"],
    "vessel.identity": ["ais", "vessel_ref"],
    "entity.sanctions": ["sanctions"],
    "entity.ownership": ["company_reg", "ownership"],
    "trade.flow": ["trade"],
  });

/** Provider kinds that could serve this attribute, longest prefix first. */
function kindsFor(attribute: string): readonly (SourceKind | "ais")[] | null {
  let best: { length: number; kinds: readonly (SourceKind | "ais")[] } | null = null;
  for (const [prefix, kinds] of Object.entries(ATTRIBUTE_PROVIDER_KINDS)) {
    if (attribute !== prefix && !attribute.startsWith(`${prefix}.`)) continue;
    if (!best || prefix.length > best.length) best = { length: prefix.length, kinds };
  }
  return best?.kinds ?? null;
}

/**
 * Ask for one attribute of one vessel.
 *
 * The single entry point every other method is built on. Resolves
 * identity, works out who could answer, checks whether any of them can
 * be reached, and — when evidence is supplied — hands it to the existing
 * fusion layers for scoring and conflict detection.
 *
 * `collect` is injected rather than called for real. No provider is
 * connected in M2.8, and a broker that fabricated a response to look
 * complete would be the exact failure this architecture exists to
 * prevent. The parameter is how a future phase plugs a live adapter in
 * without this file changing.
 */
export function getVesselIntelligence(
  imo: string,
  attribute: string,
  collect?: (
    providers: readonly ProviderAvailabilityEntry[],
    vessel: CanonicalVessel | null,
  ) => readonly NormalizedEvidence[],
): IntelligenceResult {
  const vessel = vesselIdentityIndex.getByImo(imo);
  const kinds = kindsFor(attribute);

  if (!kinds) {
    return result({
      state: "unsupported",
      attribute,
      vessel,
      providers: Object.freeze([]),
      reason: `No provider kind is registered to answer "${attribute}".`,
    });
  }

  const candidates = getProviderAvailability().filter((entry) => kinds.includes(entry.kind));
  if (candidates.length === 0) {
    return result({
      state: "unsupported",
      attribute,
      vessel,
      providers: Object.freeze([]),
      reason: `No provider of kind ${kinds.join(" or ")} is registered.`,
    });
  }

  const usable = candidates.filter((entry) => isQueryable(entry.reading));
  if (usable.length === 0) {
    /*
     * Providers exist and none can be reached.
     *
     * The reason names each provider's own status, so "unavailable"
     * never hides "PENDING_CREDENTIALS" — the second tells an operator
     * what to do about it and the first does not.
     */
    const detail = candidates.map((c) => `${c.displayName}: ${c.reading.reason}`).join("; ");
    return result({
      state: "unavailable",
      attribute,
      vessel,
      providers: Object.freeze(candidates),
      reason: `No provider for "${attribute}" is currently queryable — ${detail}.`,
    });
  }

  const collected = collect?.(usable, vessel) ?? [];
  if (collected.length === 0) {
    return result({
      state: "empty",
      attribute,
      vessel,
      providers: Object.freeze(usable),
      reason: `Queried ${usable.length} provider(s) for "${attribute}"; none reported anything.`,
    });
  }

  // Scoring and conflict detection stay in the fusion engine. The broker
  // routes and reports; it does not adjudicate.
  const scored = scoreAll(collected);
  const { items, conflicts } = detectConflicts(scored);
  const ranked = [...items].sort((a, b) => b.confidence - a.confidence);

  return Object.freeze({
    state: "ready" as const,
    attribute,
    vessel,
    evidence: Object.freeze(ranked),
    conflicts: Object.freeze(conflicts),
    providers: Object.freeze(usable),
    reason:
      conflicts.length > 0
        ? `${ranked.length} observation(s) from ${usable.length} provider(s); ${conflicts.length} contradiction(s) preserved.`
        : `${ranked.length} observation(s) from ${usable.length} provider(s), no contradictions.`,
  });
}

/** Canonical identity for an IMO, or null when the index holds none. */
export function getVesselIdentity(imo: string): CanonicalVessel | null {
  return vesselIdentityIndex.getByImo(imo);
}

/** Latest reported position. Thin wrapper; the routing lives above. */
export function getVesselPosition(
  imo: string,
  collect?: Parameters<typeof getVesselIntelligence>[2],
): IntelligenceResult {
  return getVesselIntelligence(imo, "vessel.position", collect);
}

/** Sanctions and watchlist context for a vessel's associated entities. */
export function screenVessel(
  imo: string,
  collect?: Parameters<typeof getVesselIntelligence>[2],
): IntelligenceResult {
  return getVesselIntelligence(imo, "entity.sanctions", collect);
}

/** Trade and cargo context. Served by Trade Atlas and Volza jointly. */
export function getTradeContext(
  imo: string,
  collect?: Parameters<typeof getVesselIntelligence>[2],
): IntelligenceResult {
  return getVesselIntelligence(imo, "trade.flow", collect);
}

/* ── Capability discovery ─────────────────────────────────────── */

/**
 * Whether one provider can answer one attribute, and if not, why.
 *
 * Six outcomes rather than a boolean, because "no" has five distinct
 * meanings here and an operator needs to know which: a planned provider
 * needs a contract, a credentials-required one needs configuration, and
 * an unsupported one needs neither because it will never serve this
 * attribute at all.
 */
export type CapabilityVerdict =
  | "SUPPORTED_AND_READY"
  | "SUPPORTED_BUT_NOT_CONFIGURED"
  | "SUPPORTED_BUT_AUTH_REQUIRED"
  | "SUPPORTED_BUT_STALE"
  | "PLANNED"
  | "UNSUPPORTED";

export interface CapabilityAnswer {
  readonly verdict: CapabilityVerdict;
  /** The provider's own status, so the verdict never hides the cause. */
  readonly providerStatus: string | null;
  readonly reason: string;
}

/**
 * Can this provider answer this attribute right now?
 *
 * Capability is *declared*, never inferred. A provider is considered
 * able to serve an attribute only when its registered `kind` is one the
 * attribute routes to — the same routing the broker itself uses, so a
 * provider can never be asked something `getVesselIntelligence` would
 * not have asked it. An unknown provider is `UNSUPPORTED` rather than
 * optimistically assumed capable.
 *
 * This is what makes progressive activation checkable: a provider moves
 * from `PLANNED` to `SUPPORTED_BUT_NOT_CONFIGURED` to
 * `SUPPORTED_AND_READY` purely by its registry status changing, with no
 * code in the UI, the map or the broker altering.
 */
export function canQuery(providerId: string, attribute: string): CapabilityAnswer {
  const provider = getProviderAvailability().find((p) => p.providerId === providerId);
  if (!provider) {
    return Object.freeze({
      verdict: "UNSUPPORTED" as const,
      providerStatus: null,
      reason: `No provider is registered under the id "${providerId}".`,
    });
  }

  const kinds = kindsFor(attribute);
  if (!kinds || !kinds.includes(provider.kind)) {
    /*
     * The domain boundary, enforced per provider.
     *
     * Trade Atlas is not a vessel tracker and OpenSanctions is not an
     * AIS feed. Answering "unsupported" here is what stops a future
     * caller quietly routing a position request to whichever provider
     * happens to be connected.
     */
    return Object.freeze({
      verdict: "UNSUPPORTED" as const,
      providerStatus: provider.reading.providerStatus,
      reason: `${provider.displayName} is a ${provider.kind} source and does not serve "${attribute}".`,
    });
  }

  const { availability, providerStatus } = provider.reading;
  const verdict: CapabilityVerdict =
    availability === "available"
      ? "SUPPORTED_AND_READY"
      : availability === "stale"
        ? "SUPPORTED_BUT_STALE"
        : availability === "planned"
          ? "PLANNED"
          : availability === "credentials-required"
            ? providerStatus === "AUTH_REQUIRED"
              ? "SUPPORTED_BUT_AUTH_REQUIRED"
              : "SUPPORTED_BUT_NOT_CONFIGURED"
            : "SUPPORTED_BUT_NOT_CONFIGURED";

  return Object.freeze({
    verdict,
    providerStatus,
    reason: `${provider.displayName} serves "${attribute}"; status ${providerStatus}.`,
  });
}
