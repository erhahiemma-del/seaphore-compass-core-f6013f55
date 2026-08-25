/**
 * Voyage feed.
 *
 * Reads voyages through the paths that already exist —
 * `voyages.functions.ts` → `voyage.repository.ts` — maps the rows into
 * the domain model with {@link toVoyage}, and resolves their endpoints
 * against the shared {@link portGazetteer}. No second repository, no
 * second store, no orchestration.
 *
 * ## Four states, not two
 *
 * An empty map has to say why it is empty, and there are four different
 * reasons:
 *
 *   `loading`      the request is in flight
 *   `unavailable`  the request failed — no session, no network, RLS
 *   `empty`        the query succeeded and returned nothing
 *   `ready`        voyages were returned
 *
 * `unavailable` and `empty` are the pair that matters. Both draw no
 * endpoints, and collapsing them turns "Seaphore could not ask" into
 * "there are no voyages" — the same error as an unreported heading
 * drawn as due north, one level up. The voyages table is protected by
 * row-level security that grants SELECT only to authenticated
 * officers, so an unauthenticated session gets zero rows rather than an
 * error, and this hook must not present that as an empty fleet.
 *
 * ## Geography is separate from existence
 *
 * A voyage whose ports do not resolve is still a voyage. It is counted,
 * listed and selectable; it simply contributes no marker. `coverage`
 * reports that split so the officer sees "18 voyages, 4 mappable"
 * rather than a map that looks broken.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  endpointCoverage,
  portGazetteer,
  toVoyage,
  type EndpointCoverage,
  type Voyage,
  type VoyageRowLike,
} from "@/services/geospatial";
import { voyageRepository } from "@/services/repositories/voyage.repository";
import { useAuth } from "@/hooks/use-auth";

export type VoyageFeedStatus = "loading" | "unavailable" | "empty" | "ready";

export interface VoyageFeed {
  readonly status: VoyageFeedStatus;
  readonly voyages: readonly Voyage[];
  readonly coverage: EndpointCoverage;
  /** Officer-facing sentence. Always set unless `ready`. */
  readonly note: string | null;
  /** Underlying failure, when the read could not be performed. */
  readonly error: string | null;
  readonly refresh: () => void;
}

const EMPTY_COVERAGE: EndpointCoverage = {
  voyages: 0,
  bothResolved: 0,
  oneResolved: 0,
  neitherResolved: 0,
};

export interface UseVoyagesOptions {
  /** Skip the read entirely. Used by surfaces with no voyage overlay. */
  readonly enabled?: boolean;
  readonly limit?: number;
}

export function useVoyages({
  enabled: enabledOption = true,
  limit = 200,
}: UseVoyagesOptions = {}): VoyageFeed {
  // The voyage register is a protected read: without a session the server
  // function rejects the call before it reaches the database. Wait for the
  // session rather than firing an unauthorized request.
  const { session, loading: authLoading } = useAuth();
  const enabled = enabledOption && !authLoading && Boolean(session);
  const [voyages, setVoyages] = useState<readonly Voyage[]>([]);
  const [status, setStatus] = useState<VoyageFeedStatus>(enabled ? "loading" : "empty");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setVoyages([]);
      // Not signed in yet is not "no voyages held" — say which it is.
      if (enabledOption && (authLoading || !session)) {
        setStatus(authLoading ? "loading" : "unavailable");
        setError(authLoading ? null : "No authenticated session for the voyage register.");
      } else {
        setStatus("empty");
        setError(null);
      }
      return;
    }
    let disposed = false;
    setStatus("loading");
    setError(null);

    void (async () => {
      try {
        // The gazetteer is loaded before mapping, so endpoints resolve
        // on the first pass rather than resolving to "not loaded" and
        // needing a second one.
        await portGazetteer.load?.();
        const result = await voyageRepository.list({ limit });
        if (disposed) return;

        const mapped = (result.rows ?? []).map((row) =>
          toVoyage(row as unknown as VoyageRowLike, portGazetteer),
        );
        setVoyages(mapped);
        setStatus(mapped.length === 0 ? "empty" : "ready");
      } catch (cause: unknown) {
        if (disposed) return;
        // Keep nothing. A failed read must not leave a stale picture
        // that looks current.
        setVoyages([]);
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("unavailable");
      }
    })();

    return () => {
      disposed = true;
    };
  }, [enabled, enabledOption, authLoading, session, limit, nonce]);

  const coverage = useMemo(
    () => (voyages.length === 0 ? EMPTY_COVERAGE : endpointCoverage(voyages)),
    [voyages],
  );

  const note = useMemo(() => {
    if (status === "loading") return "Loading voyages…";
    if (status === "unavailable") {
      return "Voyage records could not be read. This reflects Seaphore's access to the voyage register, not an absence of voyages.";
    }
    if (status === "empty") {
      return "No voyage records are held. This reflects Seaphore's collection, not the absence of maritime traffic.";
    }
    if (coverage.bothResolved + coverage.oneResolved === 0) {
      return `${coverage.voyages} voyage${coverage.voyages === 1 ? "" : "s"} held, none with a resolvable port position. The records exist; their geography does not.`;
    }
    return null;
  }, [status, coverage]);

  return { status, voyages, coverage, note, error, refresh };
}
