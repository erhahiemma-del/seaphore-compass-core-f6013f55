/**
 * Sea state where a vessel or a port is.
 *
 * ## Why the key is rounded here as well as on the server
 *
 * The server snaps coordinates onto a shared grid so neighbouring requests
 * reuse one cached answer. Doing the same to the query key means the client
 * does not even issue the second request: four hundred vessels in one
 * anchorage produce one fetch rather than four hundred that happen to
 * dedupe later. Both roundings use the same grid, so the key and the
 * request always agree.
 *
 * ## Why it is disabled by default
 *
 * Weather is loaded for a selected entity, never for the fleet. A map
 * refresh must not become a weather poll, and the cheapest way to
 * guarantee that is for the map to have no reason to call this at all.
 */
import { useQuery } from "@tanstack/react-query";

import type { DatalasticMarineConditions } from "@/connectors/datalastic/types";

/** Matches `WEATHER_GRID_DEGREES` on the server. Roughly eleven kilometres. */
const GRID = 0.1;

/** Matches the server's weather cache tier. */
const STALE_MS = 30 * 60_000;

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export interface MarineWeatherState {
  readonly conditions: DatalasticMarineConditions | null;
  readonly loading: boolean;
  /**
   * The provider could not be reached, or refused.
   *
   * Distinct from a successful answer with no reading: one is a collection
   * failure, the other is a fact about the water.
   */
  readonly failed: boolean;
  /** When Seaphore retrieved it, as opposed to when it was observed. */
  readonly retrievedAt: string | null;
}

export function useMarineWeather(
  position: { lat: number; lon: number } | null,
): MarineWeatherState {
  const lat = position ? snap(position.lat) : null;
  const lon = position ? snap(position.lon) : null;
  const enabled = lat !== null && lon !== null;

  const query = useQuery({
    // Rounded, so neighbours share one entry rather than one each.
    queryKey: ["datalastic", "weather", lat, lon],
    enabled,
    staleTime: STALE_MS,
    queryFn: async () => {
      const { datalasticWeather } = await import("@/lib/datalastic.functions");
      return datalasticWeather({ data: { lat: lat!, lon: lon! } });
    },
  });

  const result = query.data ?? null;
  const ok = result?.status === "ok";

  return {
    conditions: ok ? (result.data ?? null) : null,
    loading: enabled && query.isPending,
    failed: query.isError || (result !== null && !ok),
    retrievedAt: ok ? result.retrievedAt : null,
  };
}
