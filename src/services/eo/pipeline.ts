/**
 * Earth Observation pipeline.
 *
 * Composes the stages into one call: scenes in, classified events out.
 *
 *   scenes ──▶ detect ──▶ normalise ──▶ correlate ──▶ classify
 *                                          ▲
 *                              AIS reports ┘──▶ gap engine
 *
 * ## Nothing here decides anything
 *
 * Detection belongs to the processing service, correlation to
 * `correlation.ts`, classification to `events.ts`, evidence grading to the
 * OSINT engine. This module sequences them and reports what each stage
 * could not do.
 *
 * ## Scenes are processed in parallel
 *
 * They are independent — one scene's detections tell you nothing about
 * another's — and a serial loop would make the slowest scene the floor
 * for the whole area sweep.
 */
import { detectShips, type DetectionRun } from "./detector";
import { findAisGaps, type GapOptions } from "./ais-gap";
import { correlateDetections } from "./correlation";
import { byConsequence, classifyDetection, classifyGaps, dataAgeMs } from "./events";
import type { AisGap, AisReport, MaritimeEvent, SarDetection, SarScene } from "./types";

export interface EoSweepResult {
  /** Scenes the catalogue returned for the area and window. */
  readonly scenes: readonly SarScene[];
  readonly detections: readonly SarDetection[];
  readonly gaps: readonly AisGap[];
  /** Classified events, most consequential first. */
  readonly events: readonly MaritimeEvent[];
  /** One entry per scene, including the ones that could not be processed. */
  readonly runs: readonly DetectionRun[];
  /**
   * Coverage caveats, stated plainly. Non-empty is the normal case: no
   * detector configured, no AIS coverage, scenes outside the window.
   */
  readonly caveats: readonly string[];
  /**
   * Age of the most recent acquisition, in ms. Null when no scene was
   * found. Recomputed on every sweep — Sentinel-1 is not a live feed and
   * a cached age would make an old picture look current.
   */
  readonly freshestAcquisitionAgeMs: number | null;
  readonly sweptAt: string;
}

export interface SweepOptions extends GapOptions {
  readonly now?: number;
  readonly signal?: AbortSignal;
  /** Max AIS age either side of acquisition to correlate against. */
  readonly maxTimeDeltaSec?: number;
}

/**
 * Run the full pipeline over a set of scenes and the AIS picture.
 *
 * `aisReports` should be everything available for the area and window.
 * An empty array is read as *no coverage* by the correlator, which is a
 * materially different conclusion from an empty sea — so callers must
 * pass what they have rather than pre-filtering to nothing.
 */
export async function sweep(
  scenes: readonly SarScene[],
  aisReports: readonly AisReport[],
  options: SweepOptions = {},
): Promise<EoSweepResult> {
  const now = options.now ?? Date.now();
  const caveats: string[] = [];

  // Scenes are independent; run them together.
  const runs = await Promise.all(scenes.map((scene) => detectShips(scene, options.signal)));

  const detections = runs.flatMap((run) => [...run.detections]);

  for (const run of runs) {
    if (run.unavailableReason) caveats.push(run.unavailableReason);
  }

  const gaps = findAisGaps(aisReports, {
    thresholdSec: options.thresholdSec,
    now,
  });

  const correlations = correlateDetections(detections, aisReports, {
    maxTimeDeltaSec: options.maxTimeDeltaSec,
    now,
  });

  const detectionEvents = detections.map((detection, index) =>
    classifyDetection(detection, correlations[index], gaps, { now }),
  );

  const gapEvents = classifyGaps(gaps, detectionEvents);
  const events = byConsequence([...detectionEvents, ...gapEvents]);

  if (scenes.length === 0) {
    caveats.push(
      "No Sentinel-1 acquisition covers this area and time window. Sentinel-1 revisits a given area every few days, so an area may simply not have been observed.",
    );
  }
  if (aisReports.length === 0) {
    caveats.push(
      "No AIS reports were available for this area and window, so no detection can be matched or excluded against the cooperative picture.",
    );
  }

  const acquisitionTimes = scenes
    .map((scene) => Date.parse(scene.acquiredAt))
    .filter((ms) => !Number.isNaN(ms));

  return {
    scenes,
    detections,
    gaps,
    events,
    runs,
    caveats: [...new Set(caveats)],
    freshestAcquisitionAgeMs: acquisitionTimes.length
      ? dataAgeMs(new Date(Math.max(...acquisitionTimes)).toISOString(), now)
      : null,
    sweptAt: new Date(now).toISOString(),
  };
}
