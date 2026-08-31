/**
 * The NPA record for whichever vessel is selected.
 *
 * Reads the union the vessel source has already computed rather than
 * recomputing it. The source unifies both providers on every refresh, so
 * a hook that ran `unifyFleet` again would do the same work a second time
 * per selection and could disagree with what the map is drawing — two
 * answers to "is this vessel corroborated", differing by one refresh.
 *
 * Returns null when the selected vessel has no NPA record at all, which
 * is the ordinary case for a hull in transit: the workbook covers
 * Nigerian port operations, and a ship calling elsewhere is expected to
 * be absent from it.
 */
import { useEffect, useState } from "react";

import { getVesselSource } from "@/services/geospatial";
import type { UnifiedVessel } from "@/services/government/npa/unified-fleet";
import {
  loadCommittedNpaDataset,
  NpaAugmentedVesselSource,
} from "@/services/geospatial/sources/npa-augmented-source";
import type { NpaOperationalDataset } from "@/services/government/npa/workbook-ingest";
import type { FacilityRegistry } from "@/services/registry/registry-ingest";

/**
 * The union, if a source that computes one is registered.
 *
 * Narrowed by instance rather than by a duck-typed `unified` method, so a
 * future source that happens to expose the same name cannot be mistaken
 * for one that has actually resolved two providers against each other.
 */
function unifiedFleet(): readonly UnifiedVessel[] {
  for (const id of ["datalastic", "npa-operational"]) {
    const source = getVesselSource(id);
    if (source instanceof NpaAugmentedVesselSource) return source.unified();
  }
  return [];
}

export interface NpaContextState {
  readonly vessel: UnifiedVessel | null;
  /** True while the union has not been computed yet — not "no record". */
  readonly pending: boolean;
}

export function useNpaContext(imo: string | null): NpaContextState {
  const [state, setState] = useState<NpaContextState>({ vessel: null, pending: true });

  useEffect(() => {
    if (!imo) {
      setState({ vessel: null, pending: false });
      return;
    }

    let cancelled = false;

    /*
     * Polled briefly rather than subscribed to. The union is recomputed
     * on the source's own refresh cycle and publishes no event, and a
     * selection made before the first refresh would otherwise show "no
     * NPA record" permanently — which is the exact confusion between
     * "not loaded" and "no record" this codebase keeps out of the UI.
     */
    const settle = () => {
      const fleet = unifiedFleet();
      if (cancelled) return false;
      if (fleet.length === 0) return false;
      setState({
        vessel: fleet.find((entry) => entry.imo === imo || entry.key === `imo:${imo}`) ?? null,
        pending: false,
      });
      return true;
    };

    if (settle()) return;

    const timer = setInterval(() => {
      if (settle()) clearInterval(timer);
    }, 500);
    // Stop waiting eventually: a union that never arrives is a source
    // that is not reporting, and the panel should say so rather than
    // spin forever.
    const giveUp = setTimeout(() => {
      clearInterval(timer);
      if (!cancelled) setState((current) => ({ ...current, pending: false }));
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(giveUp);
    };
  }, [imo]);

  return state;
}

/**
 * The ingested NPA workbook itself, for panels that need more than the
 * per-vessel union.
 *
 * The port panel needs berths, terminals and every call at a port, none
 * of which the unified fleet carries — it is keyed by vessel. Loaded
 * through the same lazy import the vessel source uses, so the 380 KB
 * chunk is fetched once and shared rather than pulled twice.
 */
export function useNpaDataset(): {
  readonly dataset: NpaOperationalDataset | null;
  readonly pending: boolean;
} {
  const [state, setState] = useState<{
    dataset: NpaOperationalDataset | null;
    pending: boolean;
  }>({ dataset: null, pending: true });

  useEffect(() => {
    let cancelled = false;
    void loadCommittedNpaDataset()
      .then((dataset) => {
        if (!cancelled) setState({ dataset, pending: false });
      })
      .catch(() => {
        // A dataset that will not load leaves the panel able to say so,
        // rather than showing an empty port as though it were quiet.
        if (!cancelled) setState({ dataset: null, pending: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * The facility registry — what a terminal *is*, as opposed to what is
 * happening at it.
 *
 * Loaded separately from the NPA dataset and lazily, for the same reason:
 * it is a quarter of a megabyte that only the panels which show
 * infrastructure need. A page that never opens a port never fetches it.
 */
export function useFacilityRegistry(): {
  readonly registry: FacilityRegistry | null;
  readonly pending: boolean;
} {
  const [state, setState] = useState<{ registry: FacilityRegistry | null; pending: boolean }>({
    registry: null,
    pending: true,
  });

  useEffect(() => {
    let cancelled = false;
    void import("@/services/registry/data/facility-registry.json")
      .then((module) => {
        if (cancelled) return;
        setState({
          registry: (module.default ?? module) as unknown as FacilityRegistry,
          pending: false,
        });
      })
      .catch(() => {
        /*
         * A registry that will not load leaves the port panel working on
         * NPA alone — terminals keep their codes and berth counts, and
         * simply gain no operator or geometry.
         */
        if (!cancelled) setState({ registry: null, pending: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
