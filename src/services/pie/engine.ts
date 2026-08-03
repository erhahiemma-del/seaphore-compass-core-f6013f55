/**
 * Predictive Intelligence Engine (PIE) — main entry point.
 *
 * PIE consumes fused evidence produced by the IFE (never a raw connector) and
 * produces evidence-backed predictions. Every prediction is deterministic
 * given the same evidence + baseline state, and every prediction carries
 * citations. PIE never mutates OSAE or Copilot state directly: consumers pull
 * predictions from the store or subscribe.
 *
 * Golden Rule: Predict early. Explain every prediction. Learn continuously.
 * Never make a prediction without evidence.
 */
import type { FusedEvidencePackage } from "@/services/ife/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { NormalizedEvidence } from "@/services/ial/types";
import { createBaselineStore } from "./baselines";
import { DEFAULT_DETECTORS } from "./detectors";
import type { BaselineStore, Detector, Prediction, PredictionCycle } from "./types";

export interface PredictiveIntelligenceEngineOptions {
  readonly detectors?: ReadonlyArray<Detector>;
  readonly now?: () => Date;
  /** Minimum probability at which a prediction is flagged as an alert. */
  readonly alertThreshold?: number;
  /** Cooldown in ms during which a repeat of the same prediction id is
   *  demoted from `alert=true` to reduce false-positive noise. */
  readonly alertCooldownMs?: number;
}

export type PieIngestInput =
  | { readonly evidence: ReadonlyArray<NormalizedEvidence> }
  | { readonly fused: FusedEvidencePackage; readonly evidence?: ReadonlyArray<NormalizedEvidence> }
  | {
      readonly unified: UnifiedIntelligencePackage;
      readonly evidence?: ReadonlyArray<NormalizedEvidence>;
    };

type Listener = (cycle: PredictionCycle) => void;

export class PredictiveIntelligenceEngine {
  private readonly detectors: ReadonlyArray<Detector>;
  private readonly baselines: BaselineStore = createBaselineStore();
  private readonly now: () => Date;
  private readonly alertThreshold: number;
  private readonly alertCooldownMs: number;

  private readonly predictions = new Map<string, Prediction>();
  private readonly lastAlertAt = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private revision = 0;

  constructor(opts: PredictiveIntelligenceEngineOptions = {}) {
    this.detectors = opts.detectors ?? DEFAULT_DETECTORS;
    this.now = opts.now ?? (() => new Date());
    this.alertThreshold = opts.alertThreshold ?? 0.55;
    this.alertCooldownMs = opts.alertCooldownMs ?? 15 * 60 * 1000;
  }

  /**
   * Ingest evidence and produce a prediction cycle. Evidence must originate
   * from the IAL / IFE — PIE never accepts connector-native records.
   */
  ingest(input: PieIngestInput): PredictionCycle {
    const startedAt = this.now();
    this.revision += 1;

    const evidence = pickEvidence(input);
    const evidenceByEntity = groupByEntity(evidence);

    const produced: Prediction[] = [];
    for (const det of this.detectors) {
      try {
        const items = det.detect({
          now: startedAt,
          evidence,
          evidenceByEntity,
          baselines: this.baselines,
          revision: this.revision,
        });
        for (const p of items) produced.push(this.applyCooldown(p, startedAt));
      } catch (err) {
        // Deterministic failure: a single detector never breaks the cycle.
        // Fail closed — no prediction rather than a wrong one.
        // eslint-disable-next-line no-console
        console.warn(`[PIE] detector ${det.id} failed`, err);
      }
    }

    // Persist / update predictions keyed by their stable id.
    for (const p of produced) this.predictions.set(p.id, p);

    const alerts = produced.filter((p) => p.alert);
    const cycle: PredictionCycle = {
      cycleId: `pie_cycle_${startedAt.getTime()}_${this.revision}`,
      startedAt: startedAt.toISOString(),
      finishedAt: this.now().toISOString(),
      evidenceConsidered: evidence.length,
      predictions: produced,
      alerts,
    };
    for (const l of this.listeners) l(cycle);
    return cycle;
  }

  /** All predictions currently held by the engine (most recent per id). */
  all(): ReadonlyArray<Prediction> {
    return Array.from(this.predictions.values()).sort((a, b) => b.probability - a.probability);
  }

  /** All predictions for a given canonical entity id. */
  forEntity(entityId: string): ReadonlyArray<Prediction> {
    return this.all().filter((p) => p.subject.id === entityId);
  }

  /** Subscribe to cycle events. Returns unsubscribe. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.predictions.clear();
    this.lastAlertAt.clear();
    this.revision = 0;
  }

  private applyCooldown(p: Prediction, now: Date): Prediction {
    if (!p.alert) return p;
    const last = this.lastAlertAt.get(p.id);
    if (last !== undefined && now.getTime() - last < this.alertCooldownMs) {
      // Still important, but do not re-fire the alert channel — the officer
      // has already been notified in this window.
      return { ...p, alert: false };
    }
    if (p.probability >= this.alertThreshold) this.lastAlertAt.set(p.id, now.getTime());
    return p;
  }
}

function pickEvidence(input: PieIngestInput): ReadonlyArray<NormalizedEvidence> {
  if ("evidence" in input && input.evidence) return input.evidence;
  if ("fused" in input && input.fused && "evidence" in input && input.evidence)
    return input.evidence;
  if ("unified" in input && input.unified && "evidence" in input && input.evidence)
    return input.evidence;
  return [];
}

function groupByEntity(
  records: ReadonlyArray<NormalizedEvidence>,
): ReadonlyMap<string, ReadonlyArray<NormalizedEvidence>> {
  const map = new Map<string, NormalizedEvidence[]>();
  for (const r of records) {
    const arr = map.get(r.entity.id) ?? [];
    arr.push(r);
    map.set(r.entity.id, arr);
  }
  // Deterministic ordering by observedAt so detectors see a stable timeline.
  for (const [k, arr] of map) {
    arr.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    map.set(k, arr);
  }
  return map;
}

/** Process-wide singleton so OSAE/Copilot see one PIE. */
let singleton: PredictiveIntelligenceEngine | null = null;
export function getPie(): PredictiveIntelligenceEngine {
  if (!singleton) singleton = new PredictiveIntelligenceEngine();
  return singleton;
}
