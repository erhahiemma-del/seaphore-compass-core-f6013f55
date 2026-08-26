/**
 * Running the search.
 *
 * The only part of the command pipeline that talks to anything. It owns
 * the debounce, the stale-response guard and the mapping from a thrown
 * error to a state an officer can read. Everything it decides is
 * delegated to the pure model.
 *
 * ## It calls the repository, not a provider
 *
 * `entityRepository.list({ q })` wraps the existing `searchEntities`
 * server function: auth middleware, RLS, zod-validated input, 25-row
 * cap. The browser never reaches a provider and never sees a secret —
 * the search runs server-side against the entity registry the officer is
 * already authorised to read.
 *
 * That function existed before this phase and had no UI caller at all.
 * Nothing here is a new backend.
 *
 * ## Stale responses are dropped, not rendered
 *
 * Typing "APAPA" fires as the officer pauses; a slow response for "APA"
 * can land after a fast one for "APAPA". Without a guard the older
 * result wins and the officer watches their own results get worse as
 * they type. Each run takes a sequence number and only the newest is
 * allowed to write.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { entityRepository } from "@/services/repositories/entity.repository";
import { useMissionMode } from "@/features/mission-control/useMissionMode";

import {
  isSearchable,
  toSearchState,
  type CommandEntityRow,
  type CommandSearchState,
} from "./results";
import { parseCommandQuery, type CommandQuery } from "./query";

/**
 * How long to wait after the last keystroke.
 *
 * Long enough that typing an IMO is one request rather than seven, short
 * enough that the pause does not read as lag.
 */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Translate a thrown error into something the officer can act on.
 *
 * Only the cases that can be identified confidently are named; anything
 * else is reported as a failure with its detail rather than being
 * guessed into a more specific state. Claiming "provider offline" for an
 * unrecognised error would send someone to check a system that is fine.
 */
export function classifySearchError(error: unknown): CommandSearchState {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (lower.includes("unauthor") || lower.includes("not authenticated") || lower.includes("401")) {
    return { state: "auth-required" };
  }
  if (lower.includes("forbidden") || lower.includes("permission") || lower.includes("403")) {
    return { state: "permission-denied" };
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("timeout")) {
    return { state: "source-unavailable", detail: message };
  }
  return { state: "failed", detail: message };
}

export interface CommandSearchController {
  readonly input: string;
  readonly setInput: (value: string) => void;
  readonly query: CommandQuery;
  readonly state: CommandSearchState;
  /** Run immediately, skipping the debounce. For Enter and replays. */
  readonly runNow: (value?: string) => void;
  readonly clear: () => void;
}

export function useCommandSearch(): CommandSearchController {
  const { mode } = useMissionMode();
  const [input, setInput] = useState("");
  const [state, setState] = useState<CommandSearchState>({ state: "idle" });

  const query = useMemo(() => parseCommandQuery(input), [input]);

  /** Newest run wins. Incremented per search, checked before every write. */
  const runId = useRef(0);

  const execute = useCallback(
    async (q: CommandQuery) => {
      if (!isSearchable(q)) {
        // Below the threshold is not "no results" — nothing was asked.
        setState(q.kind === "empty" ? { state: "idle" } : { state: "typing" });
        return;
      }

      const id = ++runId.current;
      setState({ state: "searching" });

      try {
        const { rows } = await entityRepository.list({ q: q.normalized });
        if (id !== runId.current) return;
        setState(toSearchState(rows as readonly CommandEntityRow[], q, mode));
      } catch (error) {
        if (id !== runId.current) return;
        setState(classifySearchError(error));
      }
    },
    [mode],
  );

  // Debounced run on input change.
  useEffect(() => {
    if (!isSearchable(query)) {
      // Cancel any in-flight run: clearing the box must not be overwritten
      // by a result for what used to be there.
      runId.current++;
      setState(query.kind === "empty" ? { state: "idle" } : { state: "typing" });
      return;
    }
    const timer = setTimeout(() => void execute(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, execute]);

  const runNow = useCallback(
    (value?: string) => {
      const q = value === undefined ? query : parseCommandQuery(value);
      if (value !== undefined) setInput(value);
      void execute(q);
    },
    [query, execute],
  );

  const clear = useCallback(() => {
    runId.current++;
    setInput("");
    setState({ state: "idle" });
  }, []);

  return { input, setInput, query, state, runNow, clear };
}
