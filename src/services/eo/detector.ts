/**
 * Earth Observation — ship detection port.
 *
 * ## Why this is a port and not an implementation
 *
 * Detecting ships in SAR imagery is a real computer-vision problem: CFAR
 * thresholding over a sea-clutter model, land masking, azimuth-ambiguity
 * rejection, then a classifier. It needs the raw pixels — hundreds of
 * megabytes per scene — and a GPU. None of that belongs in a Cloudflare
 * Worker, and no such model or service exists in this repository.
 *
 * So this module declares the contract a processing service must satisfy
 * and registers whichever one is configured. The default is
 * {@link unavailableDetector}, which returns no detections and says why.
 *
 * The alternative — synthesising plausible detections so the pipeline has
 * something to show — would put fabricated vessels on an officer's map.
 * There is no version of that which is acceptable, so an unconfigured
 * detector reports its absence and the pipeline surfaces it.
 */
import type { DetectorProvenance, SarDetection, SarScene } from "./types";

/** Outcome of running a detector over one scene. Never throws to the caller. */
export interface DetectionRun {
  readonly sceneId: string;
  readonly status: "ok" | "no-detector" | "unsupported-scene" | "processing-failed";
  readonly detections: readonly SarDetection[];
  /** Populated for every non-`ok` status. Officer-facing. */
  readonly unavailableReason: string | null;
  readonly detector: DetectorProvenance | null;
  readonly durationMs: number;
}

/**
 * A ship-detection processing service.
 *
 * Implementations fetch the scene's pixels from `scene.assetHref`
 * themselves; Seaphore never proxies imagery.
 */
export interface ShipDetector {
  readonly serviceId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  /**
   * Modes this detector is calibrated for. A model trained on IW will
   * produce nonsense on WV, and running it anyway would generate
   * confident false detections rather than an honest refusal.
   */
  readonly supportedModes: readonly SarScene["mode"][];
  detect(scene: SarScene, signal?: AbortSignal): Promise<readonly SarDetection[]>;
}

/**
 * The default detector: none.
 *
 * Returns no detections and explains the absence, so the map shows a
 * stated gap in coverage rather than an empty sea that reads as "nothing
 * out there".
 */
export const unavailableDetector: ShipDetector = {
  serviceId: "none",
  modelId: "none",
  modelVersion: "0",
  supportedModes: [],
  detect: () => Promise.resolve([]),
};

const state: { detector: ShipDetector | null } = { detector: null };

/**
 * Install the configured detection service.
 *
 * Called once at the composition root when `SAR_DETECTOR_URL` (or an
 * equivalent) is provisioned. Registering twice replaces, so a deployment
 * can swap models without a restart path.
 */
export function registerShipDetector(detector: ShipDetector): void {
  state.detector = detector;
}

export function getShipDetector(): ShipDetector | null {
  return state.detector;
}

/** Test seam. */
export function clearShipDetector(): void {
  state.detector = null;
}

/**
 * Run detection over one scene.
 *
 * Never throws: a failing model must not take down the acquisition
 * pipeline, and the officer needs to know the scene was looked at and
 * failed rather than seeing it silently missing.
 */
export async function detectShips(scene: SarScene, signal?: AbortSignal): Promise<DetectionRun> {
  const started = Date.now();
  const detector = state.detector;

  if (!detector) {
    return {
      sceneId: scene.sceneId,
      status: "no-detector",
      detections: [],
      unavailableReason:
        "No SAR ship-detection service is configured. Scene metadata was retrieved, but the imagery has not been processed, so absence of detections says nothing about what was present.",
      detector: null,
      durationMs: Date.now() - started,
    };
  }

  if (!detector.supportedModes.includes(scene.mode)) {
    return {
      sceneId: scene.sceneId,
      status: "unsupported-scene",
      detections: [],
      unavailableReason: `Detector ${detector.modelId} is calibrated for ${detector.supportedModes.join(", ") || "no modes"} and cannot process a ${scene.mode} acquisition. Running it anyway would produce false detections rather than none.`,
      detector: null,
      durationMs: Date.now() - started,
    };
  }

  if (!scene.assetHref) {
    return {
      sceneId: scene.sceneId,
      status: "unsupported-scene",
      detections: [],
      unavailableReason:
        "The catalogue entry carries no downloadable asset, so the processing service has nothing to read.",
      detector: null,
      durationMs: Date.now() - started,
    };
  }

  const provenance: DetectorProvenance = {
    serviceId: detector.serviceId,
    modelId: detector.modelId,
    modelVersion: detector.modelVersion,
    processedAt: new Date().toISOString(),
  };

  try {
    const detections = await detector.detect(scene, signal);
    return {
      sceneId: scene.sceneId,
      status: "ok",
      detections,
      unavailableReason: null,
      detector: provenance,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      sceneId: scene.sceneId,
      status: "processing-failed",
      detections: [],
      unavailableReason: `Ship detection failed for this scene: ${
        error instanceof Error ? error.message : String(error)
      }. The scene was acquired but not analysed.`,
      detector: provenance,
      durationMs: Date.now() - started,
    };
  }
}
