/**
 * GIP — Incremental vessel update engine.
 *
 * Holds the authoritative in-memory vessel set for the map and converts
 * incoming data into the smallest possible render instruction.
 *
 * The problem it exists to solve: a full refresh rebuilds every feature in
 * the source, which at national scale means thousands of features redrawn
 * because one AIS report arrived. The engine diffs against what is already
 * on screen and emits only what actually changed — the requirement stated in
 * the Live Map guide G3 ("only re-renders changed vessels, not full refresh").
 *
 * The engine is renderer-optional: with no renderer injected it is a pure
 * state machine that returns diffs, which is how it is unit-tested. Inject a
 * {@link MapRenderer} and it will also push batches to the engine.
 *
 * Sprint G5.5.1 — mechanical diffing only. It never decides which vessels
 * matter; it only tracks which ones changed.
 */
import type { MapEventBus } from "./event-bus";
import type { MapRenderer, VesselFeatureCollection, VesselRenderBatch } from "./renderer";
import {
  hasRenderableChange,
  toVesselFeature,
  vesselKey,
  type Vessel,
  type VesselRenderContext,
} from "./vessel";

/** The outcome of reconciling incoming vessels against current state. */
export interface VesselDiff {
  readonly added: readonly Vessel[];
  readonly updated: readonly Vessel[];
  /** IMOs no longer present. */
  readonly removed: readonly string[];
  /** Count of vessels present in both sets with no render-affecting change. */
  readonly unchanged: number;
}

/** An empty diff — a convenient identity value. */
export const EMPTY_DIFF: VesselDiff = { added: [], updated: [], removed: [], unchanged: 0 };

/** Whether a diff would cause any visible change. */
export function isEmptyDiff(diff: VesselDiff): boolean {
  return diff.added.length === 0 && diff.updated.length === 0 && diff.removed.length === 0;
}

/**
 * Reconcile an incoming vessel list against the current set.
 *
 * Pure: it neither reads nor writes engine state, which makes the diffing
 * rules independently testable.
 */
export function diffVessels(
  current: ReadonlyMap<string, Vessel>,
  incoming: readonly Vessel[],
): VesselDiff {
  const added: Vessel[] = [];
  const updated: Vessel[] = [];
  const seen = new Set<string>();
  let unchanged = 0;

  for (const vessel of incoming) {
    const key = vesselKey(vessel);
    // Later entries win when a batch contains the same vessel twice.
    if (seen.has(key)) {
      const alreadyQueued = updated.findIndex((v) => vesselKey(v) === key);
      if (alreadyQueued >= 0) updated[alreadyQueued] = vessel;
      else {
        const addedIndex = added.findIndex((v) => vesselKey(v) === key);
        if (addedIndex >= 0) added[addedIndex] = vessel;
      }
      continue;
    }
    seen.add(key);

    const existing = current.get(key);
    if (!existing) added.push(vessel);
    else if (hasRenderableChange(existing, vessel)) updated.push(vessel);
    else unchanged += 1;
  }

  const removed: string[] = [];
  for (const key of current.keys()) {
    if (!seen.has(key)) removed.push(key);
  }

  return { added, updated, removed, unchanged };
}

/** Injection points for the update engine. */
export interface VesselUpdateEngineOptions {
  /** Optional renderer. Omit for a headless engine (tests, SSR, workers). */
  readonly renderer?: MapRenderer | null;
  /** Optional bus. When present, `vessels:applied` is emitted per batch. */
  readonly bus?: MapEventBus | null;
  /** Presentation context supplier, re-read on every apply. */
  readonly renderContext?: () => VesselRenderContext;
}

export class VesselUpdateEngine {
  private readonly vessels = new Map<string, Vessel>();
  private renderer: MapRenderer | null;
  private readonly bus: MapEventBus | null;
  private readonly renderContext: () => VesselRenderContext;

  constructor(options: VesselUpdateEngineOptions = {}) {
    this.renderer = options.renderer ?? null;
    this.bus = options.bus ?? null;
    this.renderContext = options.renderContext ?? (() => ({}));
  }

  /**
   * Attach or replace the renderer after construction.
   *
   * Supports the real mount order: the engine is created and may already be
   * accumulating vessels before the canvas exists. On attach, the current set
   * is pushed so the renderer starts in sync rather than empty.
   */
  attachRenderer(renderer: MapRenderer | null): void {
    this.renderer = renderer;
    if (renderer && this.vessels.size > 0) {
      renderer.setVesselData(this.toFeatureCollection());
    }
  }

  /**
   * Reconcile a complete vessel list — the periodic full refresh.
   *
   * Despite receiving everything, only the delta reaches the renderer.
   */
  applyFull(incoming: readonly Vessel[]): VesselDiff {
    const diff = diffVessels(this.vessels, incoming);
    for (const vessel of diff.removed) this.vessels.delete(vessel);
    for (const vessel of [...diff.added, ...diff.updated]) {
      this.vessels.set(vesselKey(vessel), vessel);
    }
    this.push(diff);
    return diff;
  }

  /**
   * Apply a single-vessel update — the realtime path.
   *
   * Returns an empty diff when nothing render-affecting changed, so a stream
   * of identical reports costs nothing.
   */
  applyPatch(vessel: Vessel): VesselDiff {
    const key = vesselKey(vessel);
    const existing = this.vessels.get(key);
    if (existing && !hasRenderableChange(existing, vessel)) {
      return { ...EMPTY_DIFF, unchanged: 1 };
    }
    this.vessels.set(key, vessel);
    const diff: VesselDiff = existing
      ? { added: [], updated: [vessel], removed: [], unchanged: 0 }
      : { added: [vessel], updated: [], removed: [], unchanged: 0 };
    this.push(diff);
    return diff;
  }

  /** Drop a vessel. Returns an empty diff when it was not present. */
  remove(imo: string): VesselDiff {
    if (!this.vessels.delete(imo)) return EMPTY_DIFF;
    const diff: VesselDiff = { added: [], updated: [], removed: [imo], unchanged: 0 };
    this.push(diff);
    return diff;
  }

  /** Current vessel for an IMO. */
  get(imo: string): Vessel | undefined {
    return this.vessels.get(imo);
  }

  /** Every tracked vessel. */
  snapshot(): readonly Vessel[] {
    return [...this.vessels.values()];
  }

  get size(): number {
    return this.vessels.size;
  }

  /** Drop all vessels and clear the renderer's source. */
  clear(): void {
    const removed = [...this.vessels.keys()];
    this.vessels.clear();
    if (removed.length > 0) {
      this.push({ added: [], updated: [], removed, unchanged: 0 });
    }
  }

  /** Project the full set to a feature collection. */
  toFeatureCollection(): VesselFeatureCollection {
    const ctx = this.renderContext();
    return {
      type: "FeatureCollection",
      features: this.snapshot().map((vessel) => toVesselFeature(vessel, ctx)),
    };
  }

  /**
   * Rebuild every feature without changing the underlying vessel set.
   *
   * Needed when presentation context changes rather than data — a new
   * selection, or freshness decay crossing the stale threshold. The vessels
   * are identical; only their derived properties differ.
   */
  refreshPresentation(): void {
    if (!this.renderer || this.vessels.size === 0) return;
    this.renderer.setVesselData(this.toFeatureCollection());
  }

  private push(diff: VesselDiff): void {
    if (isEmptyDiff(diff)) return;
    if (this.renderer) {
      const ctx = this.renderContext();
      const batch: VesselRenderBatch = {
        added: diff.added.map((vessel) => toVesselFeature(vessel, ctx)),
        updated: diff.updated.map((vessel) => toVesselFeature(vessel, ctx)),
        removed: diff.removed,
      };
      this.renderer.patchVessels(batch);
    }
    this.bus?.emit("vessels:applied", {
      added: diff.added.length,
      updated: diff.updated.length,
      removed: diff.removed.length,
      total: this.vessels.size,
    });
  }
}
