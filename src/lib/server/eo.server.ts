/**
 * ─────────────────────────────────────────────────────────────────────
 *  SEAPHORE SERVER-ONLY GATEWAY — EARTH OBSERVATION (SENTINEL-1 SAR)
 * ─────────────────────────────────────────────────────────────────────
 *
 * Server-only (`.server.ts` — blocked from the client bundle). This is
 * the single place Copernicus is reachable from.
 *
 * Security invariants (architectural, not conventional):
 *   • COPERNICUS_USERNAME / COPERNICUS_PASSWORD are read inside
 *     `CopernicusProvider`, on the server, per call.
 *   • The CDSE token and STAC endpoint never cross the RPC boundary.
 *   • The browser receives normalised `SarScene` / `MaritimeEvent`
 *     objects and nothing else. It cannot address Copernicus, and does
 *     not know it exists.
 *   • Raw imagery is never proxied. `assetHref` is passed through so a
 *     processing service can fetch it directly, which also keeps
 *     provenance checkable.
 *
 * Intelligence invariants:
 *   • Acquisition only. This module never labels a scene, never infers
 *     vessel presence, and never scores risk.
 *   • Sentinel-1 is not a live feed. Every scene carries its acquisition
 *     time and the caller is given the age.
 * ─────────────────────────────────────────────────────────────────────
 */
import { CopernicusProvider } from "@/connectors/implementations/CopernicusProvider";
import type {
  AcquisitionQuery,
  EvidenceFieldValue,
  NormalizedEvidence,
} from "@/services/ial/types";
import type {
  AisReport,
  GeoJsonPolygon,
  Polarisation,
  SarScene,
  Sentinel1Mode,
} from "@/services/eo";
import { sweep, type EoSweepResult } from "@/services/eo";

/** Sentinel-1 collection name in the CDSE STAC catalogue. */
const SENTINEL1_COLLECTION = "SENTINEL-1";

/**
 * Sentinel-1 revisit at the equator, in days.
 *
 * With two spacecraft the exact-repeat cycle is 6 days; with one it is
 * 12. Quoted to callers so "no scenes found" can be read as "the
 * satellite was not overhead" rather than "the sea was empty".
 */
export const SENTINEL1_REVISIT_DAYS = 6;

export type EoSearchStatus =
  "ok" | "empty" | "credentials-missing" | "auth-failed" | "upstream-error";

export interface EoAreaQuery {
  /** Area of interest. Closed ring, [lon, lat] pairs. */
  readonly polygon: GeoJsonPolygon;
  readonly fromIso: string;
  readonly toIso: string;
  /** Cap on scenes returned. Defaults to 20. */
  readonly limit?: number;
}

export interface EoSceneSearchResult {
  readonly status: EoSearchStatus;
  readonly scenes: readonly SarScene[];
  /** Populated for every non-`ok` status. Officer-facing. */
  readonly unavailableReason: string | null;
  readonly queriedAt: string;
  readonly durationMs: number;
}

/* ── Normalisation ─────────────────────────────────────────────── */

function toMode(raw: unknown): Sentinel1Mode {
  const value = String(raw ?? "").toUpperCase();
  return value === "IW" || value === "EW" || value === "SM" || value === "WV" ? value : "unknown";
}

function toPolarisation(raw: unknown): Polarisation {
  const value = String(raw ?? "")
    .toUpperCase()
    .replace(/[\s,&]+/g, "+");
  const known: Polarisation[] = ["VV+VH", "HH+HV", "VV", "VH", "HH", "HV"];
  return known.find((p) => value === p) ?? "unknown";
}

function toPolygon(geometry: unknown): GeoJsonPolygon | null {
  if (!geometry || typeof geometry !== "object") return null;
  const geo = geometry as { type?: string; coordinates?: unknown };
  if (geo.type !== "Polygon" || !Array.isArray(geo.coordinates)) return null;
  return geo as GeoJsonPolygon;
}

function toBbox(raw: unknown): SarScene["bbox"] {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const [a, b, c, d] = raw as number[];
  return [a, b, c, d];
}

function str(value: EvidenceFieldValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: EvidenceFieldValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Normalise one IAL evidence record into a `SarScene`.
 *
 * The Copernicus provider flattens STAC into its canonical `fields` map,
 * so this reads that map rather than the raw feature — going around the
 * provider would mean a second STAC parser to keep in step with CDSE.
 *
 * Exported for testing: this mapping is where a silent field rename
 * upstream would otherwise go unnoticed.
 */
export function normalizeScene(record: NormalizedEvidence, retrievedAt: string): SarScene | null {
  const fields = record.fields;
  const sceneId = str(fields.sceneId) ?? record.providerRecordId ?? null;
  const acquiredAt = str(fields.acquisitionTime) ?? record.observedAt ?? null;

  // A scene with no id or no acquisition time is unusable: everything
  // downstream is indexed by when the satellite looked, and defaulting
  // would produce an observation that appears to have happened at an
  // invented moment.
  if (!sceneId || !acquiredAt) return null;

  const west = num(fields.bboxWest);
  const south = num(fields.bboxSouth);
  const east = num(fields.bboxEast);
  const north = num(fields.bboxNorth);

  let footprint: GeoJsonPolygon | null = null;
  const geometryJson = str(fields.geometryJson);
  if (geometryJson) {
    try {
      footprint = toPolygon(JSON.parse(geometryJson));
    } catch {
      // A malformed footprint is dropped rather than guessed at; bbox
      // still gives the map something truthful to draw.
      footprint = null;
    }
  }

  return {
    sceneId,
    sensor: "sentinel-1",
    platform: str(fields.platform) ?? "SENTINEL-1",
    mode: toMode(fields.sarMode),
    polarisation: toPolarisation(fields.sarPolarisation),
    acquiredAt,
    footprint,
    bbox:
      west !== null && south !== null && east !== null && north !== null
        ? toBbox([west, south, east, north])
        : null,
    groundSampleDistanceM: num(fields.groundSamplingDistance),
    collection: str(fields.collection) ?? SENTINEL1_COLLECTION,
    // The full product, never the browse thumbnail — a detector run on a
    // preview JPEG would produce confident nonsense.
    assetHref: str(fields.productHref),
    license: str(fields.license),
    retrievedAt,
  };
}

/* ── Scene search ──────────────────────────────────────────────── */

let provider: CopernicusProvider | null = null;

function getProvider(): CopernicusProvider {
  provider ??= new CopernicusProvider();
  return provider;
}

/** Test seam. */
export function __setEoProvider(next: CopernicusProvider | null): void {
  provider = next;
}

/**
 * Search Sentinel-1 scenes intersecting a polygon over a time window.
 *
 * Never throws. Every failure mode becomes a status and a reason, because
 * a thrown error at this layer would render as an empty map — and an empty
 * map is indistinguishable from an empty sea.
 */
export async function searchSentinel1Scenes(query: EoAreaQuery): Promise<EoSceneSearchResult> {
  const started = Date.now();
  const queriedAt = new Date(started).toISOString();
  const fail = (status: EoSearchStatus, unavailableReason: string): EoSceneSearchResult => ({
    status,
    scenes: [],
    unavailableReason,
    queriedAt,
    durationMs: Date.now() - started,
  });

  if (!process.env.COPERNICUS_USERNAME || !process.env.COPERNICUS_PASSWORD) {
    return fail(
      "credentials-missing",
      "Copernicus credentials are not configured, so no Sentinel-1 scene could be searched. This is a configuration gap, not an absence of satellite coverage.",
    );
  }

  const acquisition: AcquisitionQuery = {
    entityType: "VESSEL",
    filters: {
      collection: SENTINEL1_COLLECTION,
      intersects: query.polygon,
      datetime: `${query.fromIso}/${query.toIso}`,
      limit: query.limit ?? 20,
    },
  } as AcquisitionQuery;

  try {
    const result = await getProvider().search(acquisition);
    if (!result.ok) {
      const message = result.error ?? "unknown error";
      return /credential|token|auth|401|403/i.test(message)
        ? fail("auth-failed", `Copernicus authentication failed: ${message}`)
        : fail("upstream-error", `Copernicus scene search failed: ${message}`);
    }

    const scenes = (result.records ?? [])
      .map((record) => normalizeScene(record, queriedAt))
      .filter((scene): scene is SarScene => scene !== null);

    if (scenes.length === 0) {
      return {
        status: "empty",
        scenes: [],
        unavailableReason: `No Sentinel-1 acquisition covers this area between ${query.fromIso} and ${query.toIso}. Sentinel-1's exact-repeat cycle is about ${SENTINEL1_REVISIT_DAYS} days, so an area is frequently not observed within a short window.`,
        queriedAt,
        durationMs: Date.now() - started,
      };
    }

    return {
      status: "ok",
      scenes,
      unavailableReason: null,
      queriedAt,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/credential|token|auth|401|403/i.test(message)) {
      return fail("auth-failed", `Copernicus authentication failed: ${message}`);
    }
    return fail("upstream-error", `Copernicus scene search failed: ${message}`);
  }
}

/* ── Full sweep ────────────────────────────────────────────────── */

export interface EoAreaSweep extends EoSweepResult {
  readonly searchStatus: EoSearchStatus;
  /** Stated revisit cadence, so "no scenes" is legible as a revisit gap. */
  readonly revisitDays: number;
}

/**
 * Search, detect, correlate and classify for an area and window.
 *
 * The AIS picture is supplied by the caller rather than fetched here:
 * SeaVantage, Datalastic, Spire and GFW each have their own gateway, and
 * duplicating one inside the EO module would create a second AIS path.
 */
export async function sweepArea(
  query: EoAreaQuery,
  aisReports: readonly AisReport[],
  options: { readonly now?: number; readonly signal?: AbortSignal } = {},
): Promise<EoAreaSweep> {
  const search = await searchSentinel1Scenes(query);
  const result = await sweep(search.scenes, aisReports, options);

  return {
    ...result,
    searchStatus: search.status,
    revisitDays: SENTINEL1_REVISIT_DAYS,
    caveats: search.unavailableReason
      ? [...new Set([search.unavailableReason, ...result.caveats])]
      : result.caveats,
  };
}
