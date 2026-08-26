/**
 * Recent searches.
 *
 * ## Why this is a store when the phase says not to add one
 *
 * The rule it must not break is "no second search state system" and "no
 * second focus store". This is neither. It holds one thing nothing else
 * in the application owns — what the officer has typed before — and no
 * other surface is a candidate source of truth for it. The live query,
 * the results and the focused subject all still live where they already
 * lived.
 *
 * ## Why it persists, and what it deliberately does not
 *
 * The command bar's previous history was a module-level mutable object:
 *
 *     const HISTORY: Record<EntityType, string[]> = { imo: [], ... }
 *
 * Two problems. It was not React state, so pushing to it never triggered
 * a render — entries appeared only when something unrelated re-rendered
 * the bar. And it died with the tab, which is the opposite of useful for
 * a list whose entire purpose is to survive.
 *
 * Persisted under the same `seaphore.*.v` convention the mission
 * workspace uses. Only the query text is stored: no results, no entity
 * ids, no timestamps beyond ordering. A recent search is a note about
 * what the officer asked, not a cache of what the system answered, and
 * storing answers would let a stale one outlive the data behind it.
 *
 * Nothing is seeded. The reference design shows five example chips; they
 * are a picture of the pattern, and shipping them as real history would
 * tell an officer they had searched for vessels they have never seen.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Enough to be useful, few enough to stay scannable in one row. */
export const RECENT_SEARCH_LIMIT = 8;

interface RecentSearchState {
  readonly queries: readonly string[];
  /** Record a query the officer actually ran. */
  readonly remember: (query: string) => void;
  readonly clear: () => void;
}

/**
 * Insert a query at the front, de-duplicated, capped.
 *
 * Exported and pure so the ordering rules are testable without the
 * store. De-duplication is case-insensitive but preserves the casing the
 * officer most recently typed — searching "apapa" after "Apapa" should
 * move the entry, not add a second one that looks identical in a list.
 */
export function withRecentSearch(
  existing: readonly string[],
  query: string,
  limit = RECENT_SEARCH_LIMIT,
): readonly string[] {
  const trimmed = query.trim();
  if (!trimmed) return existing;
  const lower = trimmed.toLowerCase();
  return [trimmed, ...existing.filter((q) => q.toLowerCase() !== lower)].slice(0, limit);
}

export const useRecentSearchStore = create<RecentSearchState>()(
  persist(
    (set) => ({
      queries: [],
      remember: (query) => set((s) => ({ queries: withRecentSearch(s.queries, query) })),
      clear: () => set({ queries: [] }),
    }),
    { name: "seaphore.recent-searches.v1" },
  ),
);
