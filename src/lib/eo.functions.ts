/**
 * Thin server-function wrappers for the Earth Observation gateway.
 *
 * This file intentionally contains ONLY `createServerFn` declarations and
 * imports (per `tanstack-serverfn-splitting`). All logic lives in
 * `src/lib/server/eo.server.ts`, which is blocked from client bundles.
 *
 * These wrappers are the ONLY way the browser reaches Sentinel-1 data.
 * The Copernicus endpoint, credentials and OAuth token never cross this
 * boundary — the client sends a polygon and a window, and receives
 * normalised scenes, detections and classified events.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  searchSentinel1Scenes,
  sweepArea,
  SENTINEL1_REVISIT_DAYS,
  type EoAreaSweep,
  type EoSceneSearchResult,
} from "@/lib/server/eo.server";
import type { AisReport, GeoJsonPolygon } from "@/services/eo";

/** Ceiling on scenes per request, to bound both cost and payload size. */
const MAX_SCENES = 50;
/** Ceiling on AIS reports accepted for correlation in one request. */
const MAX_AIS_REPORTS = 5_000;

interface AreaInput {
  polygon: GeoJsonPolygon;
  fromIso: string;
  toIso: string;
  limit?: number;
}

function validateArea(data: AreaInput): AreaInput {
  if (!data || typeof data !== "object") throw new Error("query is required");
  const { polygon, fromIso, toIso } = data;
  if (!polygon || polygon.type !== "Polygon" || !Array.isArray(polygon.coordinates)) {
    throw new Error("polygon must be a GeoJSON Polygon");
  }
  if (typeof fromIso !== "string" || Number.isNaN(Date.parse(fromIso))) {
    throw new Error("fromIso must be an ISO 8601 timestamp");
  }
  if (typeof toIso !== "string" || Number.isNaN(Date.parse(toIso))) {
    throw new Error("toIso must be an ISO 8601 timestamp");
  }
  if (Date.parse(fromIso) >= Date.parse(toIso)) {
    throw new Error("fromIso must be earlier than toIso");
  }
  return {
    polygon,
    fromIso,
    toIso,
    limit: Math.min(MAX_SCENES, Math.max(1, data.limit ?? 20)),
  };
}

/**
 * Catalogue search only — which Sentinel-1 scenes cover this area and
 * window. No imagery is fetched and no detection is run.
 */
export const eoSearchScenes = createServerFn({ method: "POST" })
  .inputValidator(validateArea)
  .handler(async ({ data }): Promise<EoSceneSearchResult> => {
    try {
      return await searchSentinel1Scenes(data);
    } catch (err) {
      // searchSentinel1Scenes is written not to throw; this is the
      // backstop, because a thrown error here renders as an empty map and
      // an empty map is indistinguishable from an empty sea.
      console.error("[eoSearchScenes] unexpected error", err);
      return {
        status: "upstream-error",
        scenes: [],
        unavailableReason: "Unexpected failure while searching Sentinel-1 scenes.",
        queriedAt: new Date().toISOString(),
        durationMs: 0,
      };
    }
  });

/**
 * Full sweep: scene search, detection, correlation and classification.
 *
 * The AIS picture is supplied by the caller rather than fetched here.
 * SeaVantage, Datalastic, Spire and GFW each have their own gateway, and
 * fetching AIS inside the EO gateway would create a second AIS path that
 * could disagree with the first.
 */
export const eoSweepArea = createServerFn({ method: "POST" })
  .inputValidator((data: AreaInput & { aisReports?: AisReport[] }) => {
    const area = validateArea(data);
    const aisReports = Array.isArray(data.aisReports)
      ? data.aisReports.slice(0, MAX_AIS_REPORTS)
      : [];
    return { ...area, aisReports };
  })
  .handler(async ({ data }): Promise<EoAreaSweep> => {
    const { aisReports, ...area } = data;
    try {
      return await sweepArea(area, aisReports);
    } catch (err) {
      console.error("[eoSweepArea] unexpected error", err);
      return {
        scenes: [],
        detections: [],
        gaps: [],
        events: [],
        runs: [],
        caveats: [
          "The Earth Observation sweep failed. No conclusion should be drawn about what was or was not present in this area.",
        ],
        freshestAcquisitionAgeMs: null,
        sweptAt: new Date().toISOString(),
        searchStatus: "upstream-error",
        revisitDays: SENTINEL1_REVISIT_DAYS,
      };
    }
  });
