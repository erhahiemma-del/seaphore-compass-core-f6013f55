/**
 * Port gazetteer — resolving a port identifier to a position.
 *
 * A voyage names its endpoints by identifier, not by coordinate. This is
 * the seam that turns one into the other, and the only place in the map
 * that is allowed to answer "where is this port".
 *
 * ## Three outcomes, never two
 *
 * Resolution is a three-way result, and the distinction is the whole
 * point of the module:
 *
 *   `resolved`             we know the port and where it is
 *   `position-unavailable` we know the port; its position is unpublished
 *   `unknown`              we have never heard of this identifier
 *
 * Collapsing the middle case into either neighbour is a truth failure.
 * Folding it into `unknown` says a real port does not exist; folding it
 * into `resolved` requires inventing a coordinate. UN/LOCODE lists 17,596
 * seaports and publishes positions for 11,829 of them — including no
 * position for Apapa, Tin Can, Warri or Calabar — so this is the common
 * case, not an edge case.
 *
 * ## Nothing is geocoded
 *
 * There is no fallback that turns a name into a point. If no provider
 * holds a position, the answer is `position-unavailable` and the caller
 * renders that state. A plausible-looking coordinate derived from a
 * country centroid or a name lookup would be indistinguishable on screen
 * from a surveyed one, which is the same failure as an unreported
 * heading drawn as due north.
 *
 * ## Providers are layered and replaceable
 *
 * `LayeredPortGazetteer` asks each provider in order and takes the first
 * positive answer, so a precise local source outranks a coarse global
 * one. Swapping the global dataset — for licensing reasons or for a
 * better one — touches this file and nothing in the voyage domain.
 */
import { NIMASA_PORTS } from "./constants";
import type { LonLat } from "./types";

/** How precisely a provider knows a position. Carried, never assumed. */
export type PositionPrecision =
  /** Surveyed or operator-published position. */
  | "surveyed"
  /** Degree-and-minute centroid, roughly ±1 km. UN/LOCODE's resolution. */
  | "degree-minute"
  /** Provider did not say. Treated as the weakest claim. */
  | "unspecified";

export interface ResolvedPort {
  readonly status: "resolved";
  /** The identifier as resolved, normalised. */
  readonly code: string;
  readonly name: string;
  /** ISO 3166-1 alpha-2, when the provider carries one. */
  readonly country: string | null;
  readonly position: LonLat;
  readonly precision: PositionPrecision;
  /** Which provider answered. Surfaced in the UI. */
  readonly source: string;
}

export interface PortWithoutPosition {
  readonly status: "position-unavailable";
  readonly code: string;
  readonly name: string;
  readonly country: string | null;
  readonly source: string;
  /** Officer-facing sentence. Never blank. */
  readonly reason: string;
}

export interface UnknownPort {
  readonly status: "unknown";
  readonly code: string;
  readonly reason: string;
}

export type PortResolution = ResolvedPort | PortWithoutPosition | UnknownPort;

/** True when a resolution carries a position that may be drawn. */
export function isLocated(
  resolution: PortResolution | null | undefined,
): resolution is ResolvedPort {
  return resolution?.status === "resolved";
}

/**
 * A provider of port positions.
 *
 * `resolve` is synchronous because callers render per-frame; a provider
 * that needs to load does so through `load()`, which the host awaits
 * once. A provider that has not loaded must answer `unknown` rather than
 * block or guess.
 */
export interface PortGazetteer {
  readonly id: string;
  /** Optional warm-up. Resolvers must remain callable before it settles. */
  load?(): Promise<void>;
  resolve(code: string): PortResolution;
  /** How many identifiers this provider currently holds. */
  readonly size: number;
}

/**
 * Normalise an identifier for lookup.
 *
 * Upper-cased and stripped of the space UN/LOCODE prints between the
 * country and location parts (`NG APP`). Nothing else — a code this
 * cannot recognise must fall through to `unknown`, not be coerced into
 * something that happens to match.
 */
export function normalizePortCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/* ── NIMASA ───────────────────────────────────────────────────── */

/**
 * UN/LOCODE aliases for the five NIMASA ports.
 *
 * The repository's own keys (`NGAPAPA`, `NGWARR`, `NGONNE`) are seven
 * characters and are **not** valid UN/LOCODEs, which are five. The real
 * codes are below. Both spellings resolve, because voyage rows may carry
 * either, and neither is wrong — they are just different namespaces.
 *
 * Worth stating plainly: UN/LOCODE publishes *no position* for Apapa,
 * Tin Can, Warri or Calabar. This provider is therefore not a
 * convenience layer over the global one — for four of Nigeria's five
 * ports it is the only source of a position at all.
 */
export const NIMASA_ALIASES: Readonly<Record<string, string>> = {
  NGAPP: "NGAPAPA",
  NGTIN: "NGTIN",
  NGWAR: "NGWARR",
  NGCBQ: "NGCBQ",
  NGONN: "NGONNE",
};

/**
 * The five NIMASA ports, at the positions this repository already holds.
 *
 * Precision is `surveyed` relative to UN/LOCODE's degree-minute grid —
 * these are operator reference positions carried in `constants.ts`, not
 * derived from the global dataset.
 */
export class NimasaPortGazetteer implements PortGazetteer {
  readonly id = "nimasa";

  get size(): number {
    return Object.keys(NIMASA_PORTS).length;
  }

  resolve(code: string): PortResolution {
    const normalized = normalizePortCode(code);
    const key = NIMASA_ALIASES[normalized] ?? normalized;
    const port = NIMASA_PORTS[key];
    if (!port) {
      return {
        status: "unknown",
        code: normalized,
        reason: "Not one of the five NIMASA ports.",
      };
    }
    return {
      status: "resolved",
      code: normalized,
      name: port.name,
      country: "NG",
      position: [port.lon, port.lat],
      precision: "surveyed",
      source: this.id,
    };
  }
}

/* ── UN/LOCODE ────────────────────────────────────────────────── */

/** Shape of the generated asset. See `scripts/build-port-gazetteer.mjs`. */
export interface GazetteerAsset {
  readonly metadata: {
    readonly name: string;
    readonly source: string;
    readonly licence: string;
    readonly seaportCount: number;
    readonly locatedCount: number;
    readonly coordinatePrecision: string;
    readonly notice: string;
  };
  readonly ports: Readonly<Record<string, { n: string; c: string; p?: readonly [number, number] }>>;
}

/** Where the generated asset is served from. */
export const GAZETTEER_ASSET_URL = "/gazetteer/un-locode-ports.json";

/**
 * The global seaport list, from UN/LOCODE.
 *
 * Loaded on demand rather than bundled: the asset is ~850 KB, and a map
 * that is not showing voyages has no reason to pay for it. Until `load`
 * resolves, every lookup answers `unknown` — which the caller renders as
 * "not resolved yet", never as "no such port".
 */
export class UnLocodePortGazetteer implements PortGazetteer {
  readonly id = "un-locode";

  private asset: GazetteerAsset | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly fetchAsset: () => Promise<GazetteerAsset> = defaultAssetFetch) {}

  get size(): number {
    return this.asset ? Object.keys(this.asset.ports).length : 0;
  }

  /** Metadata for the provenance panel. Null before load. */
  get metadata(): GazetteerAsset["metadata"] | null {
    return this.asset?.metadata ?? null;
  }

  async load(): Promise<void> {
    if (this.asset) return;
    // One in-flight load, however many callers ask.
    this.loading ??= this.fetchAsset()
      .then((asset) => {
        this.asset = asset;
      })
      .catch(() => {
        // A gazetteer that failed to load resolves nothing. That surfaces
        // as "position unavailable" per port, which is honest — rather
        // than throwing and taking the map down with it.
        this.asset = null;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  resolve(code: string): PortResolution {
    const normalized = normalizePortCode(code);
    if (!this.asset) {
      return {
        status: "unknown",
        code: normalized,
        reason: "The global port gazetteer has not loaded.",
      };
    }
    const entry = this.asset.ports[normalized];
    if (!entry) {
      return {
        status: "unknown",
        code: normalized,
        reason: "No seaport with this identifier in UN/LOCODE.",
      };
    }
    if (!entry.p) {
      return {
        status: "position-unavailable",
        code: normalized,
        name: entry.n,
        country: entry.c,
        source: this.id,
        reason: "UN/LOCODE lists this seaport but publishes no coordinates for it.",
      };
    }
    return {
      status: "resolved",
      code: normalized,
      name: entry.n,
      country: entry.c,
      position: [entry.p[0], entry.p[1]],
      precision: "degree-minute",
      source: this.id,
    };
  }
}

async function defaultAssetFetch(): Promise<GazetteerAsset> {
  const response = await fetch(GAZETTEER_ASSET_URL);
  if (!response.ok) throw new Error(`Gazetteer fetch failed: ${response.status}`);
  return (await response.json()) as GazetteerAsset;
}

/* ── Layering ─────────────────────────────────────────────────── */

/**
 * Ask each provider in order; take the first that resolves a position.
 *
 * Order is precedence. A `position-unavailable` from an early provider
 * does not stop the search — a later provider may hold the coordinate —
 * but it is remembered, so if nobody resolves it we can still answer
 * "this port is real, its position is not published" rather than
 * "unknown", which would be a worse and less true answer.
 */
export class LayeredPortGazetteer implements PortGazetteer {
  readonly id = "layered";

  constructor(private readonly providers: readonly PortGazetteer[]) {}

  get size(): number {
    return this.providers.reduce((total, provider) => total + provider.size, 0);
  }

  async load(): Promise<void> {
    await Promise.all(this.providers.map((provider) => provider.load?.() ?? Promise.resolve()));
  }

  resolve(code: string): PortResolution {
    const normalized = normalizePortCode(code);
    let knownButUnplaced: PortWithoutPosition | null = null;

    for (const provider of this.providers) {
      const result = provider.resolve(normalized);
      if (result.status === "resolved") return result;
      if (result.status === "position-unavailable") knownButUnplaced ??= result;
    }

    return (
      knownButUnplaced ?? {
        status: "unknown",
        code: normalized,
        reason: "No configured gazetteer recognises this port identifier.",
      }
    );
  }
}

/**
 * The gazetteer the map uses.
 *
 * NIMASA first: it holds real positions for four Nigerian ports that
 * UN/LOCODE leaves unplaced, so putting the global set first would
 * downgrade the home operational area to "position unavailable".
 */
export const portGazetteer = new LayeredPortGazetteer([
  new NimasaPortGazetteer(),
  new UnLocodePortGazetteer(),
]);
