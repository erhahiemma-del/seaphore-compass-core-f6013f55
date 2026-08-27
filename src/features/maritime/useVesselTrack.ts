/**
 * Fetch the selected vessel's recorded movement, once per selection.
 *
 * The archive belongs to whichever source is feeding the map, so this
 * asks that source through the registry rather than holding a history of
 * its own. Nothing is cached beyond the current selection: a second copy
 * of the record an investigation cites is exactly what
 * `vessel-history` was written to avoid.
 *
 * ## It asks once, for the vessel, not for the position
 *
 * Keyed on the selected vessel's identifier. Keyed on the position it
 * would re-query the archive several times a second as display positions
 * arrive, which is a request storm in exchange for a track that barely
 * changes.
 *
 * ## A late answer for a vessel nobody is looking at is discarded
 *
 * An officer moving between vessels faster than the archive answers would
 * otherwise see one ship's track drawn under another's name — the same
 * race the vessel image had, with a worse failure, because a track looks
 * like evidence about the vessel it is drawn beneath.
 */
import { useEffect, useState } from "react";

import { getVesselSource, hasHistory } from "@/services/geospatial/vessel-source";
import { resolveVesselTrack, type VesselTrack } from "@/services/geospatial/vessel-track";

/**
 * The active source's track for a vessel, or an account of its absence.
 *
 * `null` while a request is in flight, so a caller can tell "asking"
 * from "asked and there is nothing" — which are different things to show
 * an officer.
 */
export function useVesselTrack(
  imo: string | null,
  enabledSourceIds: readonly string[],
): { readonly track: VesselTrack | null; readonly loading: boolean } {
  const [track, setTrack] = useState<VesselTrack | null>(null);
  const [loading, setLoading] = useState(false);

  const sourceKey = enabledSourceIds.join(",");

  useEffect(() => {
    if (!imo) {
      setTrack(null);
      setLoading(false);
      return;
    }

    /*
     * The first enabled source that keeps an archive answers.
     *
     * Sources are asked in the order the officer enabled them, and the
     * first with the capability wins rather than the results being
     * merged — two archives disagreeing about one hull is a
     * reconciliation problem, and inventing a merge rule here would be
     * deciding it silently.
     */
    const archiveSource = sourceKey
      .split(",")
      .filter(Boolean)
      .map((id) => getVesselSource(id))
      .find((source) => source && hasHistory(source));

    if (!archiveSource) {
      setTrack(resolveVesselTrack(null, null));
      setLoading(false);
      return;
    }

    let current = true;
    setLoading(true);
    void (async () => {
      try {
        const history = await archiveSource.history!(imo);
        // Discard an answer for a vessel the officer has moved on from.
        if (!current) return;
        setTrack(resolveVesselTrack(history, archiveSource.id));
      } catch {
        /*
         * A failed lookup is not an absent archive.
         *
         * The officer needs to know the source could not answer, rather
         * than being told the vessel has no recorded movement — one is a
         * fault that may clear, the other is a fact about the vessel.
         */
        if (current) setTrack({ state: "UNAVAILABLE", reason: "LOOKUP_FAILED" });
      } finally {
        if (current) setLoading(false);
      }
    })();

    return () => {
      current = false;
    };
  }, [imo, sourceKey]);

  return { track, loading };
}
