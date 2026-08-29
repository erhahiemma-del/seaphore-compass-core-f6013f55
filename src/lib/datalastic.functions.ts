/**
 * Datalastic gateway — the browser's only route to the provider.
 *
 * Thin `createServerFn` wrappers per `tanstack-serverfn-splitting`: all
 * logic lives in `@/lib/server/datalastic.server`, which the client
 * bundle cannot import. The browser never sees the credential and never
 * addresses api.datalastic.com; it addresses Seaphore.
 *
 * Input is validated and clamped here so a malformed — or expensive —
 * client request cannot reach a metered provider.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  datalasticUsage,
  findVessels,
  getLocationTraffic,
  getStat,
  getVessel,
  getVesselHistory,
  getVesselIdentity,
  getVesselVoyage,
} from "@/lib/server/datalastic.server";
import type {
  DatalasticAccount,
  DatalasticHistoryPoint,
  DatalasticResult,
  DatalasticVesselIdentity,
  DatalasticVesselRecord,
  DatalasticVesselVoyage,
} from "@/connectors/datalastic/types";

function finite(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number`);
  return n;
}

/** Account posture. Free on Datalastic's side; never returns the key. */
export const datalasticStat = createServerFn({ method: "GET" }).handler(
  async (): Promise<DatalasticResult<DatalasticAccount>> => getStat(),
);

/** Server-side counters for the provider-health surface. */
export const datalasticUsageReport = createServerFn({ method: "GET" }).handler(async () =>
  datalasticUsage(),
);

/** Location Traffic for one circle. Radius clamped again server-side. */
export const datalasticAreaTraffic = createServerFn({ method: "POST" })
  .inputValidator((data: { lat: number; lon: number; radiusKm: number; limit?: number }) => {
    const lat = finite(data?.lat, "lat");
    const lon = finite(data?.lon, "lon");
    if (lat < -90 || lat > 90) throw new Error("lat out of range");
    if (lon < -180 || lon > 180) throw new Error("lon out of range");
    const radiusKm = Math.min(Math.max(finite(data?.radiusKm, "radiusKm"), 1), 150);
    return {
      lat,
      lon,
      radiusKm,
      ...(typeof data.limit === "number" ? { limit: Math.min(data.limit, 500) } : {}),
    };
  })
  .handler(
    async ({ data }): Promise<DatalasticResult<readonly DatalasticVesselRecord[]>> =>
      getLocationTraffic(data),
  );

/** One vessel, by IMO (preferred), MMSI, or provider uuid. */
export const datalasticVessel = createServerFn({ method: "POST" })
  .inputValidator((data: { imo?: string; mmsi?: string; uuid?: string }) => {
    const imo = typeof data?.imo === "string" ? data.imo.trim() : "";
    const mmsi = typeof data?.mmsi === "string" ? data.mmsi.trim() : "";
    const uuid = typeof data?.uuid === "string" ? data.uuid.trim() : "";
    if (!imo && !mmsi && !uuid) throw new Error("imo, mmsi or uuid is required");
    return { ...(imo ? { imo } : {}), ...(mmsi ? { mmsi } : {}), ...(uuid ? { uuid } : {}) };
  })
  .handler(async ({ data }): Promise<DatalasticResult<DatalasticVesselRecord>> => getVessel(data));

/**
 * Validator shared by the two deep-load functions.
 *
 * Both identify one vessel by the same three keys in the same order, so
 * they share the check rather than drifting apart over which key wins.
 */
function vesselKey(data: { imo?: string; mmsi?: string; uuid?: string }) {
  const imo = typeof data?.imo === "string" ? data.imo.trim() : "";
  const mmsi = typeof data?.mmsi === "string" ? data.mmsi.trim() : "";
  const uuid = typeof data?.uuid === "string" ? data.uuid.trim() : "";
  if (!imo && !mmsi && !uuid) throw new Error("imo, mmsi or uuid is required");
  return { ...(imo ? { imo } : {}), ...(mmsi ? { mmsi } : {}), ...(uuid ? { uuid } : {}) };
}

/**
 * Static particulars for one selected vessel.
 *
 * Never called for the map. One request per vessel, and the map holds
 * hundreds — this is the selection-time load, not the ambient one.
 */
export const datalasticVesselIdentity = createServerFn({ method: "POST" })
  .inputValidator(vesselKey)
  .handler(
    async ({ data }): Promise<DatalasticResult<DatalasticVesselIdentity>> =>
      getVesselIdentity(data),
  );

/** Live voyage context — ports, ETA, draught — for one selected vessel. */
export const datalasticVesselVoyage = createServerFn({ method: "POST" })
  .inputValidator(vesselKey)
  .handler(
    async ({ data }): Promise<DatalasticResult<DatalasticVesselVoyage>> => getVesselVoyage(data),
  );

/** Vessel search. Ambiguity is returned, never resolved silently. */
export const datalasticFind = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name?: string;
      imo?: string;
      mmsi?: string;
      callSign?: string;
      countryIso?: string;
    }) => {
      const clean = (value: unknown) =>
        typeof value === "string" && value.trim().length > 0
          ? value.trim().slice(0, 100)
          : undefined;
      const query = {
        ...(clean(data?.name) ? { name: clean(data.name) } : {}),
        ...(clean(data?.imo) ? { imo: clean(data.imo) } : {}),
        ...(clean(data?.mmsi) ? { mmsi: clean(data.mmsi) } : {}),
        ...(clean(data?.callSign) ? { callSign: clean(data.callSign) } : {}),
        ...(clean(data?.countryIso) ? { countryIso: clean(data.countryIso) } : {}),
      };
      if (Object.keys(query).length === 0) throw new Error("a search term is required");
      return query;
    },
  )
  .handler(
    async ({ data }): Promise<DatalasticResult<readonly DatalasticVesselRecord[]>> =>
      findVessels(data),
  );

/** Historical positions. Days clamped — history bills per calendar date. */
export const datalasticHistory = createServerFn({ method: "POST" })
  .inputValidator((data: { imo?: string; mmsi?: string; uuid?: string; days?: number }) => {
    const imo = typeof data?.imo === "string" ? data.imo.trim() : "";
    const mmsi = typeof data?.mmsi === "string" ? data.mmsi.trim() : "";
    const uuid = typeof data?.uuid === "string" ? data.uuid.trim() : "";
    if (!imo && !mmsi && !uuid) throw new Error("imo, mmsi or uuid is required");
    const days = Math.min(Math.max(Math.round(Number(data?.days ?? 3)) || 3, 1), 7);
    return {
      days,
      ...(imo ? { imo } : {}),
      ...(mmsi ? { mmsi } : {}),
      ...(uuid ? { uuid } : {}),
    };
  })
  .handler(
    async ({ data }): Promise<DatalasticResult<readonly DatalasticHistoryPoint[]>> =>
      getVesselHistory(data),
  );
