/**
 * Canonical vessel identity across providers.
 *
 * The same hull will be called different things by every source Seaphore
 * connects: Datalastic has its own record id, SeaVantage another,
 * OpenSanctions keys entities rather than ships, and an AIS feed may
 * carry only an MMSI. This is the map between them, and it follows the
 * pattern M2.7 established for ports — canonical id, explicit alias
 * index, `null` rather than a guess.
 *
 * ## IMO is the anchor, and it is not always present
 *
 * IMO numbers are permanent and hull-bound; MMSI is reassigned when a
 * ship changes flag, and names change on sale. So IMO anchors identity
 * where it exists — and where it does not, this returns nothing rather
 * than promoting an MMSI into the anchor slot. A record keyed by a
 * reassignable identifier is a record that will silently attach to the
 * wrong ship later.
 *
 * ## A provider alias is not an identity
 *
 * `providerAliases` says "Datalastic calls this hull `dl-8814`". It does
 * not say the hull *is* `dl-8814`. Nothing in Seaphore may key off a
 * provider id, because doing so makes that provider load-bearing and
 * undoes the point of the adapter layer.
 *
 * ## Nothing here scores
 *
 * Deciding *whether* two records are the same vessel is
 * `identity-confidence.ts`'s job — it already has signals, tiers and a
 * scoring model. This module holds the mapping once that decision has
 * been made, and carries the tier alongside so a caller can tell a
 * verified link from an inferred one.
 */
import type { IdentityConfidenceTier } from "./identity-confidence";

/** A provider's own identifier for a vessel, and how sure we are of the link. */
export interface ProviderAlias {
  /** Provider id, matching the adapter/registry vocabulary. */
  readonly provider: string;
  /** The provider's own record id. Opaque — never parsed. */
  readonly providerId: string;
  /**
   * How the link between this alias and the canonical vessel was
   * established. Reuses the existing ladder rather than inventing one.
   */
  readonly confidence: IdentityConfidenceTier;
  /** Where the link came from, for audit. */
  readonly source: string;
  /** When the link was asserted. */
  readonly linkedAt: string;
}

export interface CanonicalVessel {
  /** IMO number — the anchor. Seven digits, as a string. */
  readonly imo: string;
  /**
   * Maritime Mobile Service Identity, when known.
   *
   * Optional and *not* an anchor: MMSI is reassigned on reflagging, so a
   * vessel keyed by it would silently become a different ship.
   */
  readonly mmsi?: string;
  /**
   * Known names, most recent first.
   *
   * Plural because vessels are renamed, and a former name is often the
   * thread an investigation follows. Never used for matching on its own.
   */
  readonly names: readonly string[];
  /** Provider record ids. Absent provider means "we have no alias", not "none exists". */
  readonly providerAliases: readonly ProviderAlias[];
}

/** IMO numbers are seven digits. Anything else is not one. */
const IMO_PATTERN = /^\d{7}$/;

/**
 * Normalise an IMO for lookup.
 *
 * Strips the conventional `IMO` prefix and surrounding space, because
 * providers and manifests write it both ways. Returns null for anything
 * that is not seven digits afterwards — including an MMSI, which is nine
 * and would otherwise be silently accepted as an IMO.
 */
export function normalizeImo(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = value
    .trim()
    .toUpperCase()
    .replace(/^IMO[\s:-]*/, "")
    .replace(/\s+/g, "");
  return IMO_PATTERN.test(stripped) ? stripped : null;
}

/**
 * A mutable index of canonical vessels and their provider aliases.
 *
 * Deliberately an in-memory structure with no persistence and no
 * fetching: M2.8 is infrastructure, and where this index gets populated
 * from is a question for the phase that connects a provider. It exists
 * now so the broker has somewhere to resolve against, and so the
 * resolution rules are tested before any live data depends on them.
 */
export class VesselIdentityIndex {
  private readonly byImo = new Map<string, CanonicalVessel>();
  /** `provider:providerId` → IMO. */
  private readonly byProviderAlias = new Map<string, string>();
  /** MMSI → IMO. Secondary, and never an anchor. */
  private readonly byMmsi = new Map<string, string>();

  get size(): number {
    return this.byImo.size;
  }

  /**
   * Record a vessel, merging with anything already known for that IMO.
   *
   * Merging rather than replacing, because two providers will each know
   * part of the picture and neither should erase the other's aliases.
   * A rejected IMO returns null instead of throwing — a malformed
   * identifier upstream is a data problem to report, not a crash.
   */
  upsert(vessel: {
    imo: string;
    mmsi?: string;
    names?: readonly string[];
    providerAliases?: readonly ProviderAlias[];
  }): CanonicalVessel | null {
    const imo = normalizeImo(vessel.imo);
    if (!imo) return null;

    const existing = this.byImo.get(imo);
    const names = dedupe([...(vessel.names ?? []), ...(existing?.names ?? [])]);

    /*
     * Aliases are keyed by provider *and* id.
     *
     * A provider legitimately holds several records for one hull, and
     * collapsing them to one per provider would discard a link an
     * investigation may need. Re-asserting the same pair replaces it,
     * so a later, better-evidenced link wins.
     */
    const aliasMap = new Map<string, ProviderAlias>();
    for (const alias of existing?.providerAliases ?? []) {
      aliasMap.set(`${alias.provider}:${alias.providerId}`, alias);
    }
    for (const alias of vessel.providerAliases ?? []) {
      aliasMap.set(`${alias.provider}:${alias.providerId}`, alias);
    }

    const merged: CanonicalVessel = Object.freeze({
      imo,
      ...((vessel.mmsi ?? existing?.mmsi) ? { mmsi: vessel.mmsi ?? existing?.mmsi } : {}),
      names: Object.freeze(names),
      providerAliases: Object.freeze([...aliasMap.values()]),
    });

    this.byImo.set(imo, merged);
    if (merged.mmsi) this.byMmsi.set(merged.mmsi, imo);
    for (const alias of merged.providerAliases) {
      this.byProviderAlias.set(`${alias.provider}:${alias.providerId}`, imo);
    }
    return merged;
  }

  /** Look up by IMO, in any conventional spelling. */
  getByImo(imo: string | null | undefined): CanonicalVessel | null {
    const normalized = normalizeImo(imo);
    return normalized ? (this.byImo.get(normalized) ?? null) : null;
  }

  /**
   * Look up by a provider's own record id.
   *
   * This is the direction that matters when a provider answers: it hands
   * back its own id, and the broker has to know which canonical vessel
   * that is without the provider ever becoming the identity.
   */
  getByProviderId(provider: string, providerId: string): CanonicalVessel | null {
    const imo = this.byProviderAlias.get(`${provider}:${providerId}`);
    return imo ? (this.byImo.get(imo) ?? null) : null;
  }

  /**
   * Look up by MMSI.
   *
   * Offered because AIS feeds often carry nothing else, and explicitly
   * secondary: an MMSI that has been reassigned resolves to whichever
   * hull last claimed it, which is why nothing keys off this.
   */
  getByMmsi(mmsi: string | null | undefined): CanonicalVessel | null {
    if (!mmsi) return null;
    const imo = this.byMmsi.get(mmsi.trim());
    return imo ? (this.byImo.get(imo) ?? null) : null;
  }

  /** This vessel's id at one provider, or null when we hold no alias. */
  aliasFor(imo: string, provider: string): ProviderAlias | null {
    const vessel = this.getByImo(imo);
    return vessel?.providerAliases.find((a) => a.provider === provider) ?? null;
  }

  /**
   * Provider ids claiming to be the same vessel under one provider.
   *
   * More than one is a conflict worth surfacing rather than resolving
   * here: it means two of that provider's records were linked to one
   * hull, and which is right is an evidence question.
   */
  conflictingAliases(imo: string): readonly ProviderAlias[] {
    const vessel = this.getByImo(imo);
    if (!vessel) return [];
    const counts = new Map<string, ProviderAlias[]>();
    for (const alias of vessel.providerAliases) {
      const list = counts.get(alias.provider) ?? [];
      list.push(alias);
      counts.set(alias.provider, list);
    }
    return Object.freeze([...counts.values()].filter((l) => l.length > 1).flat());
  }

  list(): readonly CanonicalVessel[] {
    return Object.freeze([...this.byImo.values()]);
  }

  clear(): void {
    this.byImo.clear();
    this.byProviderAlias.clear();
    this.byMmsi.clear();
  }
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** The process-wide index. Empty until a provider phase populates it. */
export const vesselIdentityIndex = new VesselIdentityIndex();
