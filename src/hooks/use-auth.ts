import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";

import {
  getAuthSnapshot,
  getServerAuthSnapshot,
  subscribeToAuth,
  type AuthPhase,
} from "@/lib/auth/auth-controller";

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

/**
 * Session hook — one shared restoration, not one per caller.
 *
 * The shape is unchanged, so all fourteen existing callers keep working
 * exactly as before. What changed is underneath: this used to hold its
 * own `useState` and run its own `onAuthStateChange` + `getSession()` in
 * an effect, so every component that called it started a separate
 * restoration resolving on a separate clock. `RequireAuth` could believe
 * the session was resolved while `useVoyages` still believed it was
 * loading, and which one won depended on mount order — the root of the
 * non-deterministic bootstrap.
 *
 * `useSyncExternalStore` is what makes every reader see the same value in
 * the same render, which `useState` in an effect cannot guarantee.
 *
 * No client-side bypass, no mock sessions, no silent fallback timers. Dev
 * "quick login" uses real seeded accounts so `useAuth` sees a real session
 * and every server-side check works unmodified.
 */
export function useAuth(): AuthState {
  const snapshot = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, getServerAuthSnapshot);
  return {
    session: snapshot.session,
    // `error` is not loading: a failed restoration must stop the spinner
    // rather than spin forever. Callers wanting to tell "signed out" from
    // "could not tell" use `useAuthPhase`.
    loading: snapshot.phase === "initializing",
  };
}

/**
 * The four-state view, for callers that must distinguish failure from
 * absence — a signed-out officer and one whose session could not be read
 * need different screens and different retry behaviour.
 */
export function useAuthPhase(): AuthPhase {
  return useSyncExternalStore(subscribeToAuth, getAuthSnapshot, getServerAuthSnapshot).phase;
}

/**
 * Whether protected work may run.
 *
 * The single gate every protected query should use, so "is it safe to
 * call the server yet" has one answer instead of one per component.
 */
export function useProtectedQueriesEnabled(): boolean {
  return useAuthPhase() === "authenticated";
}
