/**
 * The live fleet, plus the vessels only the port authority knows about.
 *
 * ## Why a decorator and not a second source
 *
 * The map holds exactly one `VesselSource`, and the update engine keys
 * vessels by IMO. Registering NPA as a second source alongside Datalastic
 * would put two records for one hull into that map and let whichever
 * refreshed last win — so a berthed vessel would flicker between its live
 * position and its port centroid depending on timing. Wrapping instead
 * means the union is decided once, deterministically, before anything
 * reaches the engine.
 *
 * It also means nothing downstream changes. The renderer, the selection
 * model, the drawer and the camera all keep working on `Vessel`, and this
 * file is the only place that knows two providers were involved.
 *
 * ## What it adds, and what it must never add
 *
 * It adds vessels NPA has scheduled that AIS cannot currently see. Those
 * are real vessels with real operational state, and dropping them would
 * let a gap in one provider read as an empty berth.
 *
 * It does not add positions. A vessel placed here carries
 * `kind: "ADMINISTRATIVE"` — the coordinate of the port a record names,
 * never a claim about where the hull is. Everything downstream that draws
 * or exports a position is expected to read that field, which is why the
 * placement goes through the existing position-provenance model rather
 * than a flag invented here.
 */
import { unifyFleet, type UnifiedVessel } from "@/services/government/npa/unified-fleet";
import type { NpaOperationalDataset } from "@/services/government/npa/workbook-ingest";
import type { Vessel } from "../vessel";
import type { VesselHistory, VesselHistoryQuery } from "../vessel-history";
import {
  isDescribable,
  registerVesselSource,
  type DescribableVesselSource,
  type VesselQuery,
  type VesselSource,
  type VesselSourceDescriptor,
  type SourceHealthReport,
} from "../vessel-source";

/** Loader for the ingested workbook. Injected so tests need no file. */
export type NpaDatasetLoader = () => Promise<NpaOperationalDataset | null>;

/**
 * Load the committed dataset, lazily.
 *
 * A dynamic import because the JSON is roughly 600 KB: bundling it into
 * the entry chunk would make every page of the application pay for the
 * operational picture, including the ones that never show a map.
 */
export const loadCommittedNpaDataset: NpaDatasetLoader = async () => {
  const module = await import("@/services/government/npa/data/npa-operational-dataset.json");
  return (module.default ?? module) as unknown as NpaOperationalDataset;
};

/**
 * Turn a vessel only NPA knows about into something the map can draw.
 *
 * Returns null when nothing establishes a place. That is the honest
 * outcome for a vessel at a port Seaphore holds no coordinate for — it
 * stays in the operational picture and simply is not drawn, rather than
 * being given a plausible-looking point.
 */
export function toMappableVessel(unified: UnifiedVessel): Vessel | null {
  if (unified.live) return unified.live;
  if (!unified.position) return null;

  const call = unified.currentPortCall;

  return {
    identity: {
      /*
       * The engine keys on this, so it must be stable and must not
       * collide with a tracked hull. A vessel with no valid IMO gets its
       * own namespaced key rather than borrowing an MMSI — surfacing an
       * MMSI here would put it in the field the drawer labels "IMO".
       */
      imo: unified.imo ?? unified.key,
      name: unified.name,
      // NPA publishes no vessel type, so none is claimed. The renderer
      // draws an unknown-type hull, which is what this is.
    },
    position: {
      lon: unified.position.lon,
      lat: unified.position.lat,
      /*
       * No course, and the flag says so. A heading of 0 with nothing
       * marking it draws as due north, which would be a bearing NPA
       * never reported.
       */
      heading: 0,
      headingReported: false,
      // NPA publishes no speed, and the flag is what stops this zero
      // being drawn and read as "stopped at the berth".
      speed: 0,
      speedReported: false,
      /*
       * The time NPA's record is about, not the time it was ingested.
       * Falling back to ingestion time would make every unseen vessel
       * look freshly observed.
       */
      timestamp: call?.observedAt ?? "",
      kind: "ADMINISTRATIVE",
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    provenance: {
      source: NPA_AUGMENTED_SOURCE_ID,
      provider: "Nigerian Ports Authority",
      datasetId: call?.source.file,
      retrievedAt: call?.ingestedAt ?? "",
      observedAt: call?.observedAt ?? "",
    },
  };
}

export const NPA_AUGMENTED_SOURCE_ID = "npa-operational";

/**
 * Wraps a live source and folds the NPA picture into its answers.
 *
 * Delegates identity, health and history to the wrapped source: this adds
 * vessels, it does not become a provider. A caller asking what the source
 * is, or asking for a vessel's track, is asking about Datalastic.
 */
export class NpaAugmentedVesselSource implements DescribableVesselSource {
  readonly id: string;

  private dataset: NpaOperationalDataset | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly inner: VesselSource,
    private readonly load: NpaDatasetLoader = loadCommittedNpaDataset,
  ) {
    // The wrapped source's id, so diagnostics, cost accounting and the
    // source picker all continue to name the provider that bills.
    this.id = inner.id;
    // Only when the wrapped source really holds one. See `history` below.
    if (typeof inner.history === "function") {
      this.history = (imo, query) => inner.history!(imo, query);
    }
  }

  /** The most recent union, for panels that need more than a position. */
  private lastUnified: readonly UnifiedVessel[] = [];

  unified(): readonly UnifiedVessel[] {
    return this.lastUnified;
  }

  async list(query?: VesselQuery): Promise<readonly Vessel[]> {
    const [live] = await Promise.all([this.inner.list(query), this.ensureDataset()]);

    const fleet = unifyFleet(live, this.dataset);
    this.lastUnified = fleet.vessels;

    const vessels: Vessel[] = [];
    for (const unified of fleet.vessels) {
      const vessel = toMappableVessel(unified);
      if (vessel) vessels.push(vessel);
    }
    return vessels;
  }

  /*
   * Realtime and history stay the wrapped source's business. NPA
   * publishes a daily schedule, not a stream and not an archive, so
   * pretending otherwise here would let the interface offer replay for a
   * vessel whose only record is a spreadsheet row.
   */
  subscribe(onVessel: (vessel: Vessel) => void): () => void {
    return this.inner.subscribe?.(onVessel) ?? (() => {});
  }

  /*
   * Declared as an optional property rather than a method, and assigned
   * in the constructor only when the wrapped source actually keeps an
   * archive. A method here would always exist, so `hasHistory()` would
   * always be true and the interface would offer Replay for a vessel
   * whose entire record is one row of a spreadsheet.
   */
  history?: (imo: string, query?: VesselHistoryQuery) => Promise<VesselHistory>;

  describe(): VesselSourceDescriptor {
    const inner = isDescribable(this.inner) ? this.inner.describe() : null;
    return {
      id: this.id,
      label: inner ? `${inner.label} + NPA` : "NPA operational",
      type: inner?.type ?? "GOVERNMENT",
      description: inner
        ? `${inner.description} Augmented with the Nigerian Ports Authority daily shipping schedule, so vessels the port authority has scheduled appear even when AIS cannot currently see them.`
        : "Nigerian Ports Authority daily shipping schedule.",
      caveat:
        "Vessels shown from the NPA schedule alone are drawn at their port's coordinate, which is a place and not a position — no berth or terminal geometry is published.",
      defaultEnabled: inner?.defaultEnabled ?? true,
    };
  }

  /**
   * The wrapped source's health, with the NPA record count folded in.
   *
   * Delegated rather than invented: the thing that can be unreachable,
   * rate-limited or out of credit is Datalastic. NPA is a committed file,
   * so it has no status of its own to report — only a count, which is
   * added to `recordCount` so the Sources panel does not under-report
   * what the map is actually holding.
   */
  report(): SourceHealthReport {
    const inner = isDescribable(this.inner)
      ? this.inner.report()
      : ({
          sourceId: this.id,
          status: "not-queried",
          connected: false,
          message: null,
          lastCheckedAt: null,
          lastLatencyMs: null,
          recordCount: 0,
          confidence: null,
          confidenceLevel: null,
          freshnessMs: null,
          requestCount: 0,
          failureCount: 0,
          successRate: null,
          averageLatencyMs: null,
          cacheState: "unknown",
          lastSuccessfulSync: null,
          warnedCount: 0,
          rejectedCount: 0,
        } satisfies SourceHealthReport);

    const npaOnly = this.lastUnified.filter((vessel) => vessel.correlation === "NPA_ONLY").length;
    return { ...inner, recordCount: inner.recordCount + npaOnly };
  }

  private async ensureDataset(): Promise<void> {
    if (this.dataset) return;
    if (!this.loading) {
      this.loading = this.load()
        .then((dataset) => {
          this.dataset = dataset;
        })
        .catch(() => {
          /*
           * A dataset that will not load leaves the live picture intact
           * rather than taking the map down with it. The union simply
           * has one source in it, which `unifyFleet` handles.
           */
          this.dataset = null;
        });
    }
    await this.loading;
  }
}

/**
 * Fold the NPA picture into an already-registered live source.
 *
 * Registers the wrapper under the same id, which `registerVesselSource`
 * treats as a replacement — so the map ends up with exactly one source,
 * the one that bills, now answering with both providers' vessels. Calling
 * it twice is safe for the same reason.
 */
export function registerNpaAugmentedSource(
  inner: VesselSource,
  load: NpaDatasetLoader = loadCommittedNpaDataset,
): NpaAugmentedVesselSource {
  const source = new NpaAugmentedVesselSource(inner, load);
  registerVesselSource(source);
  return source;
}
