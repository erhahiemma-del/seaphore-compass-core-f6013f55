/**
 * The cross-surface findings feed.
 *
 * It reads records the provider domains already persisted and projects
 * them for display. It screens nothing, calls no provider, and raises no
 * alert — so opening the attention centre can never cause an outbound
 * request or change any domain's state.
 *
 * Arrival alerts are NOT loaded here. They have their own hook, store and
 * lifecycle (`useArrivalAlerts`), and this hook must not become a second
 * source of them. `MaritimeCommand` holds both and passes each surface
 * what it needs, which keeps the two domains separate.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { listRecentSanctionsScreenings } from "@/lib/sanctions.functions";
import type { SanctionsScreeningRecord } from "@/lib/sanctions/match-state";
import { indicatorFor, type SanctionsIndicatorState } from "@/lib/sanctions/indicator";
import { findingsFromScreenings } from "@/services/findings/from-sanctions";
import {
  countFindingsByPriority,
  orderFindings,
  type FindingAttentionPriority,
  type IntelligenceFinding,
} from "@/services/findings/finding";

export interface IntelligenceFindingsState {
  readonly findings: readonly IntelligenceFinding[];
  readonly counts: Readonly<Record<FindingAttentionPriority, number>>;
  /** Whether stored findings could be read at all. Never implied. */
  readonly loaded: boolean;
  /** Why the feed is empty, when it is empty for a reason. */
  readonly unavailableReason: string | null;
  /** The subtle indicator for one vessel, by IMO. */
  readonly sanctionsIndicator: (imo: string) => SanctionsIndicatorState;
  readonly refresh: () => void;
}

export function useIntelligenceFindings(): IntelligenceFindingsState {
  const [screenings, setScreenings] = useState<readonly SanctionsScreeningRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        if (cancelled) return;
        /*
         * Signed out there is no officer whose history this would be, so
         * the feed says so rather than showing an empty list that reads
         * as "nothing found".
         */
        setLoaded(false);
        setUnavailableReason("Sign in to see stored intelligence findings.");
        return;
      }

      try {
        const rows = await listRecentSanctionsScreenings({ data: { limit: 100 } });
        if (cancelled) return;
        setScreenings(rows);
        setLoaded(true);
        setUnavailableReason(null);
      } catch (error) {
        if (cancelled) return;
        setLoaded(false);
        setUnavailableReason(
          error instanceof Error
            ? `Stored findings could not be read: ${error.message}`
            : "Stored findings could not be read.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const findings = useMemo(() => orderFindings(findingsFromScreenings(screenings)), [screenings]);
  const counts = useMemo(() => countFindingsByPriority(findings), [findings]);

  const sanctionsIndicator = useCallback(
    (imo: string): SanctionsIndicatorState =>
      indicatorFor(screenings.filter((record) => record.subjectImo === imo)),
    [screenings],
  );

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return { findings, counts, loaded, unavailableReason, sanctionsIndicator, refresh };
}
