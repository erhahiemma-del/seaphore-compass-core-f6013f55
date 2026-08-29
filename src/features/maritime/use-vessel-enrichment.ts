/**
 * The deep vessel load, fetched once per selected vessel.
 *
 * ## Why this is a query and not a fetch in the drawer
 *
 * Both endpoints bill per request, and several surfaces want the same
 * answer: the drawer renders it, the Copilot answers questions from it, and
 * a port workspace will want the voyage. If each called the server function
 * directly, opening the drawer and asking the Copilot about the same vessel
 * would buy the answer twice. React Query dedupes by key, so they share one
 * in-flight request and one cached result — on top of the server-side cache
 * and the request governor, which remain the real spend controls.
 *
 * ## Why the two halves are separate queries
 *
 * Particulars change at a refit; the voyage changes hourly. One query would
 * force the slower half to expire with the faster, re-buying tonnage every
 * five minutes. The staleness settings here mirror the server's own cache
 * tiers so the client does not ask for something the server would only
 * answer from cache anyway.
 */
import { useQuery } from "@tanstack/react-query";

import type { VesselEnrichment } from "@/services/geospatial/vessel-enrichment";
import { toDeclaredVoyage, toVesselParticulars } from "@/services/geospatial/vessel-enrichment";

/** Mirrors `CACHE_TTL_MS.identity` on the server. */
const PARTICULARS_STALE_MS = 24 * 60 * 60_000;
/** Mirrors `CACHE_TTL_MS.voyage` on the server. */
const VOYAGE_STALE_MS = 5 * 60_000;

export interface VesselEnrichmentState {
  readonly enrichment: VesselEnrichment;
  /** True while either half is still in flight. */
  readonly loading: boolean;
  /**
   * The provider could not be reached, or refused.
   *
   * Distinct from a successful answer with no data: one is a collection
   * failure and the other is a fact about the vessel.
   */
  readonly failed: boolean;
}

const EMPTY: VesselEnrichment = {
  particulars: null,
  particularsProvenance: null,
  voyage: null,
  voyageProvenance: null,
};

/**
 * Load particulars and voyage for one vessel.
 *
 * `imo` null disables both queries — nothing is bought for a vessel nobody
 * selected, which is the rule that keeps the map's hundreds of markers from
 * becoming hundreds of paid requests.
 */
export function useVesselEnrichment(imo: string | null): VesselEnrichmentState {
  const enabled = Boolean(imo);

  const particulars = useQuery({
    queryKey: ["datalastic", "vessel_info", imo],
    enabled,
    staleTime: PARTICULARS_STALE_MS,
    queryFn: async () => {
      const { datalasticVesselIdentity } = await import("@/lib/datalastic.functions");
      return datalasticVesselIdentity({ data: { imo: imo! } });
    },
  });

  const voyage = useQuery({
    queryKey: ["datalastic", "vessel_pro", imo],
    enabled,
    staleTime: VOYAGE_STALE_MS,
    queryFn: async () => {
      const { datalasticVesselVoyage } = await import("@/lib/datalastic.functions");
      return datalasticVesselVoyage({ data: { imo: imo! } });
    },
  });

  const identityResult = particulars.data ?? null;
  const voyageResult = voyage.data ?? null;

  /*
   * `status === "ok"` with null data is a real answer: the provider knows
   * this vessel and holds no particulars. Anything else is a failure, and
   * the two must not both render as an empty panel.
   */
  const identityOk = identityResult?.status === "ok";
  const voyageOk = voyageResult?.status === "ok";

  const enrichment: VesselEnrichment = {
    particulars:
      identityOk && identityResult.data ? toVesselParticulars(identityResult.data) : null,
    particularsProvenance:
      identityOk && identityResult.data
        ? {
            provider: "Datalastic",
            endpoint: "vessel_info",
            retrievedAt: identityResult.retrievedAt,
            // vessel_info carries no observation time; it is not a position.
            observedAt: null,
          }
        : null,
    voyage: voyageOk && voyageResult.data ? toDeclaredVoyage(voyageResult.data) : null,
    voyageProvenance:
      voyageOk && voyageResult.data
        ? {
            provider: "Datalastic",
            endpoint: "vessel_pro",
            retrievedAt: voyageResult.retrievedAt,
            observedAt: voyageResult.data.observedAt,
          }
        : null,
  };

  return {
    enrichment: enabled ? enrichment : EMPTY,
    loading: particulars.isPending || voyage.isPending,
    failed:
      particulars.isError ||
      voyage.isError ||
      (identityResult !== null && !identityOk) ||
      (voyageResult !== null && !voyageOk),
  };
}
