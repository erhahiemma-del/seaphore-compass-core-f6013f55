/**
 * The persisted intelligence findings an officer is working.
 *
 * One loader for every surface that needs them — attention centre, map
 * indicators, finding panel, case view, Copilot and voice all read this
 * state, so there is exactly one answer to "what is on file" and no
 * surface can drift from another.
 *
 * It reads and it records officer decisions. It screens nothing, calls no
 * provider, and derives no status: `decideIntelligenceFinding` is the
 * only writer, and it requires an authenticated officer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  decideIntelligenceFinding,
  listIntelligenceFindings,
  syncIntelligenceFindings,
} from "@/lib/findings.functions";
import {
  orderRecords,
  type FindingDecisionKind,
  type PersistedFinding,
} from "@/services/findings/record";

/**
 * Why the list is not showing findings. Distinguished on purpose: an
 * empty estate, a signed-out officer and an unreachable store are three
 * different facts and only one of them means "nothing was found".
 */
export type FindingsFeedState = "LOADING" | "READY" | "EMPTY" | "UNAUTHENTICATED" | "UNAVAILABLE";

export interface FindingRecordsState {
  readonly findings: readonly PersistedFinding[];
  readonly feedState: FindingsFeedState;
  /** Plain sentence for the officer. Never implied by an empty list. */
  readonly unavailableReason: string | null;
  readonly byId: (id: string) => PersistedFinding | undefined;
  readonly forSubject: (subjectId: string) => readonly PersistedFinding[];
  readonly decide: (input: {
    readonly findingId: string;
    readonly decision: FindingDecisionKind;
    readonly reason?: string;
    readonly note?: string;
    readonly evidenceRef?: string;
    readonly investigationId?: string;
  }) => Promise<PersistedFinding>;
  readonly refresh: () => void;
}

export function useFindingRecords(): FindingRecordsState {
  const [findings, setFindings] = useState<readonly PersistedFinding[]>([]);
  const [feedState, setFeedState] = useState<FindingsFeedState>("LOADING");
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        if (cancelled) return;
        setFeedState("UNAUTHENTICATED");
        setUnavailableReason("Sign in to see stored intelligence findings.");
        return;
      }

      try {
        /*
         * Sync first, so a screening an officer ran a moment ago is on
         * file as a finding. It is idempotent and never reopens a ruling.
         */
        await syncIntelligenceFindings();
        const rows = await listIntelligenceFindings({ data: {} });
        if (cancelled) return;
        setFindings(orderRecords(rows));
        setFeedState(rows.length === 0 ? "EMPTY" : "READY");
        setUnavailableReason(null);
      } catch (error) {
        if (cancelled) return;
        setFeedState("UNAVAILABLE");
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

  const index = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);

  const byId = useCallback((id: string) => index.get(id), [index]);

  const forSubject = useCallback(
    (subjectId: string) => findings.filter((f) => f.subjectId === subjectId),
    [findings],
  );

  const decide = useCallback<FindingRecordsState["decide"]>(async (input) => {
    const updated = await decideIntelligenceFinding({ data: input });
    setFindings((current) =>
      orderRecords(current.map((f) => (f.id === updated.id ? updated : f))),
    );
    return updated;
  }, []);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return { findings, feedState, unavailableReason, byId, forSubject, decide, refresh };
}
