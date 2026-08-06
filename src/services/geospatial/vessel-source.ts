/**
 * GIP — Vessel source contract.
 *
 * The injection point where vessel data enters the map. Everything downstream
 * — the update engine, the renderer, the panels — depends on this interface
 * and never on a connector, a table, or an HTTP client.
 *
 * ## Architectural constraint (Golden Rule)
 *
 * No map component may read `ice_fused_intelligence`, `osint_evidence`,
 * `osint_raw`, or any connector directly. Operational data reaches the map
 * through the Intelligence Orchestrator, and a `VesselSource` is the adapter
 * that performs that translation. Implementations belong beside their data
 * owner; the map only consumes this interface.
 *
 * ## Why no orchestrator-backed source ships in G5.5.1
 *
 * The Canonical UIP (`@/services/ife/unified`) currently exposes identity,
 * fused evidence, provenance, freshness, and OSAE assessments — but **no
 * positional field**. There is therefore no honest UIP → {@link Vessel}
 * mapping to write yet: producing one would mean inventing a positional
 * convention and calling it infrastructure.
 *
 * So this sprint ships the contract and two dependency-free implementations,
 * and leaves the real adapter as a documented seam. Wiring it later is a new
 * class implementing {@link VesselSource} plus one injection at the call
 * site — no change to any consumer here.
 *
 * Sprint G5.5.1 — infrastructure only.
 */
import type { RiskLevel, Unsubscribe } from "./types";
import type { Vessel } from "./vessel";

/** Narrowing applied at the source, before data reaches the map. */
export interface VesselQuery {
  /** Restrict to vessels inside this bounding box, `[west, south, east, north]`. */
  readonly bbox?: readonly [number, number, number, number];
  readonly riskLevels?: readonly RiskLevel[];
  /** Destination LOCODE. */
  readonly destination?: string;
  /** Cap on returned vessels. Sources should apply this server-side. */
  readonly limit?: number;
}

/**
 * A provider of vessel positions.
 *
 * Implementations are expected to be cheap to construct and safe to call
 * concurrently. `list` should resolve with whatever is currently known rather
 * than block on a refresh.
 */
export interface VesselSource {
  /** Stable identifier, surfaced in diagnostics, e.g. `"ais-spire"`. */
  readonly id: string;

  /** Current vessels matching the query. */
  list(query?: VesselQuery): Promise<readonly Vessel[]>;

  /**
   * Optional realtime channel. When implemented, the host subscribes once
   * and feeds each update straight into
   * {@link VesselUpdateEngine.applyPatch}, which is the path that avoids a
   * full re-render per position report.
   *
   * Sources without a push channel simply omit this; the host falls back to
   * polling `list` on `TIMING.positionRefreshMs`.
   */
  subscribe?(onVessel: (vessel: Vessel) => void): Unsubscribe;
}

/**
 * The default source: no vessels, ever.
 *
 * This is what makes the map runnable with no connector wired. The canvas,
 * layers, panels, and camera all work; the operational picture is simply
 * empty — which is truthful, rather than seeded with demo vessels that an
 * officer could mistake for real traffic.
 */
export class EmptyVesselSource implements VesselSource {
  readonly id = "empty";

  list(): Promise<readonly Vessel[]> {
    return Promise.resolve([]);
  }
}

/**
 * An in-memory source over a fixed vessel set.
 *
 * Intended for tests, Storybook, and local development of the rendering
 * pipeline. It is *not* a mock intelligence feed: it returns exactly the
 * vessels it was constructed with and invents nothing.
 */
export class StaticVesselSource implements VesselSource {
  readonly id = "static";
  private vessels: readonly Vessel[];
  private readonly listeners = new Set<(vessel: Vessel) => void>();

  constructor(vessels: readonly Vessel[] = []) {
    this.vessels = vessels;
  }

  list(query?: VesselQuery): Promise<readonly Vessel[]> {
    let result = this.vessels;
    if (query?.riskLevels?.length) {
      const allowed = new Set(query.riskLevels);
      result = result.filter((vessel) => allowed.has(vessel.riskLevel));
    }
    if (query?.bbox) {
      const [west, south, east, north] = query.bbox;
      result = result.filter(
        (vessel) =>
          vessel.position.lon >= west &&
          vessel.position.lon <= east &&
          vessel.position.lat >= south &&
          vessel.position.lat <= north,
      );
    }
    if (query?.destination) {
      result = result.filter((vessel) => vessel.position.destination === query.destination);
    }
    if (typeof query?.limit === "number") result = result.slice(0, query.limit);
    return Promise.resolve(result);
  }

  subscribe(onVessel: (vessel: Vessel) => void): Unsubscribe {
    this.listeners.add(onVessel);
    return () => {
      this.listeners.delete(onVessel);
    };
  }

  /** Push a vessel to subscribers, simulating a realtime report. */
  emit(vessel: Vessel): void {
    this.vessels = [
      ...this.vessels.filter((existing) => existing.identity.imo !== vessel.identity.imo),
      vessel,
    ];
    for (const listener of [...this.listeners]) listener(vessel);
  }
}

/* ─────────────────────────────────────────────────────────────────────
 *  SOURCE DESCRIPTORS AND DISCOVERY  (Step 4b · additive)
 *
 *  The Layer Panel's Sources section must list every registered provider
 *  without knowing any provider's name. That requires two things, both
 *  added here rather than in a new module:
 *
 *    1. A descriptor every source declares about itself.
 *    2. A place to look them up.
 *
 *  This is deliberately the thinnest possible discovery surface — a Map
 *  and three functions — mirroring `@/lib/osint/registry`, which does the
 *  same job for OSINT connectors. It introduces no lifecycle, no
 *  ordering guarantees, and no orchestration.
 * ───────────────────────────────────────────────────────────────────── */

/** Where a provider's data comes from, for officer-facing grouping. */
export type SourceType = "OSINT" | "COMMERCIAL" | "GOVERNMENT";

/** Operational state of a provider, independent of any one query. */
export type SourceStatus =
  "ok" | "empty" | "credentials-missing" | "auth-failed" | "upstream-error" | "not-queried";

/**
 * Self-description of a provider.
 *
 * The UI renders from this alone, so adding a provider never requires a
 * UI change — which is the whole point of the descriptor.
 */
export interface VesselSourceDescriptor {
  readonly id: string;
  readonly label: string;
  readonly type: SourceType;
  /** One line an officer can read to know what this provider contributes. */
  readonly description: string;
  /**
   * Honest statement of what the data is and is not. Rendered beside the
   * provider so a limitation can never be lost between code and screen.
   */
  readonly caveat?: string;
  /** Whether the provider is switched on when no preference is stored. */
  readonly defaultEnabled: boolean;
}

/** A point-in-time report from a provider. */
export interface SourceHealthReport {
  readonly sourceId: string;
  readonly status: SourceStatus;
  readonly connected: boolean;
  readonly message: string | null;
  readonly lastCheckedAt: string | null;
  readonly lastLatencyMs: number | null;
  /** Records currently held from this provider. */
  readonly recordCount: number;
  /** Confidence the provider's observations carry, 0-1, or null if unknown. */
  readonly confidence: number | null;
  /** Banded form of {@link confidence}. */
  readonly confidenceLevel: string | null;
  /** Age of the newest observation in milliseconds, or null if none. */
  readonly freshnessMs: number | null;
}

/**
 * A provider that can appear in the Sources section.
 *
 * Optional on {@link VesselSource} so existing sources — the empty and
 * static ones — remain valid without change.
 */
export interface DescribableVesselSource extends VesselSource {
  describe(): VesselSourceDescriptor;
  report(): SourceHealthReport;
}

/** True when a source can describe itself well enough to be listed. */
export function isDescribable(source: VesselSource): source is DescribableVesselSource {
  const candidate = source as Partial<DescribableVesselSource>;
  return typeof candidate.describe === "function" && typeof candidate.report === "function";
}

const sources = new Map<string, DescribableVesselSource>();

/**
 * Make a source discoverable by the Sources section.
 *
 * Idempotent by id: re-registering replaces, so hot reload does not
 * produce duplicates. Returns an unregister handle.
 */
export function registerVesselSource(source: DescribableVesselSource): () => void {
  const id = source.describe().id;
  sources.set(id, source);
  return () => {
    if (sources.get(id) === source) sources.delete(id);
  };
}

/** Every registered source, ordered by type then label. */
export function listVesselSources(): readonly DescribableVesselSource[] {
  const order: Record<SourceType, number> = { GOVERNMENT: 0, COMMERCIAL: 1, OSINT: 2 };
  return [...sources.values()].sort((a, b) => {
    const da = a.describe();
    const db = b.describe();
    const byType = order[da.type] - order[db.type];
    return byType !== 0 ? byType : da.label.localeCompare(db.label);
  });
}

/** Look up one registered source. */
export function getVesselSource(id: string): DescribableVesselSource | undefined {
  return sources.get(id);
}

/** Remove every registration. Test isolation only. */
export function clearVesselSources(): void {
  sources.clear();
}

/** Ids of sources enabled by default, for seeding map state. */
export function defaultEnabledSourceIds(): readonly string[] {
  return listVesselSources()
    .map((source) => source.describe())
    .filter((descriptor) => descriptor.defaultEnabled)
    .map((descriptor) => descriptor.id);
}
