/**
 * One auth restoration, shared by everything that asks.
 *
 * ## The problem this replaces
 *
 * `useAuth` held its session in `useState` and ran its own
 * `onAuthStateChange` + `getSession()` inside `useEffect`. Fourteen
 * components call it, so a single page load started fourteen independent
 * restorations, each resolving at its own moment. There was no such thing
 * as "the" auth state: `RequireAuth` could believe the session was
 * resolved while `useVoyages` still believed it was loading, and which
 * one won depended on mount order.
 *
 * That is the whole reason bootstrap was non-deterministic. Every
 * protected query was gated on a *different* clock, so fixing one call
 * site moved the failure to the next one rather than removing it — the
 * symptom-by-symptom cycle this task exists to end.
 *
 * Two other patterns existed alongside it: `Detect.tsx` kept its own
 * `useState<"loading"|"in"|"out">` with another `getSession()`, and
 * `auth.store.ts` was read by two files and written by none. This is the
 * one restoration all of them can share.
 *
 * ## It is not a second auth system
 *
 * Supabase remains the source of truth. This holds no credentials, makes
 * no authorization decision, and adds no storage. It subscribes once and
 * lets many readers observe the same answer, which is strictly less
 * machinery than fourteen subscriptions.
 *
 * ## Four states, because the difference matters
 *
 * `loading` and `session` alone cannot express failure: the old hook's
 * `catch` set `loading = false` with a null session, which is byte-identical
 * to "signed out". An officer whose session could not be read was shown
 * the sign-in screen as though they had simply logged out, and any retry
 * loop kept firing against a backend that was erroring.
 */
import type { Session } from "@supabase/supabase-js";

import { getBackendAuthSafely } from "@/lib/backend-client-safe";

export type AuthPhase =
  /** No answer yet. Protected work must not start. */
  | "initializing"
  /** A session exists. Protected work may proceed. */
  | "authenticated"
  /** Resolved, and there is no session. Not an error. */
  | "unauthenticated"
  /** Restoration itself failed. Distinct from being signed out. */
  | "error";

export interface AuthSnapshot {
  readonly phase: AuthPhase;
  readonly session: Session | null;
  /** Present only in the `error` phase. */
  readonly error: string | null;
}

const INITIAL: AuthSnapshot = { phase: "initializing", session: null, error: null };

let snapshot: AuthSnapshot = INITIAL;
let started = false;
let resolvers: ((s: AuthSnapshot) => void)[] = [];
const listeners = new Set<() => void>();

function emit(next: AuthSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
  // Anyone awaiting first resolution is released as soon as the phase
  // stops being `initializing`, and never woken again.
  if (next.phase !== "initializing" && resolvers.length > 0) {
    const waiting = resolvers;
    resolvers = [];
    for (const resolve of waiting) resolve(next);
  }
}

/**
 * Begin restoration. Safe to call repeatedly; only the first call works.
 *
 * Idempotent for the same reason the module registry is: a module graph
 * can be evaluated more than once, and a second restoration would add a
 * second subscription — the very thing this removes.
 */
export function startAuth(): void {
  if (started) return;
  started = true;

  const auth = getBackendAuthSafely();
  if (!auth) {
    // No client at all — the browser build has no backend bindings. That
    // is a configuration failure, not a signed-out officer.
    emit({
      phase: "error",
      session: null,
      error: "Backend client unavailable — the browser build has no Lovable Cloud bindings.",
    });
    return;
  }

  // Subscribed before the first read, so a session arriving mid-read is
  // not missed. This is the canonical Supabase ordering.
  auth.onAuthStateChange((_event, next) => {
    emit({
      phase: next ? "authenticated" : "unauthenticated",
      session: next ?? null,
      error: null,
    });
  });

  auth
    .getSession()
    .then(({ data }) => {
      emit({
        phase: data.session ? "authenticated" : "unauthenticated",
        session: data.session,
        error: null,
      });
    })
    .catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error("[Seaphore auth] Session restoration failed:", cause);
      emit({ phase: "error", session: null, error: message });
    });
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

/**
 * The server's answer.
 *
 * Always `initializing`: the server holds no browser session, and
 * claiming `unauthenticated` there would render the signed-out UI into
 * the HTML for an officer who is signed in, producing a visible flip on
 * hydration.
 */
export function getServerAuthSnapshot(): AuthSnapshot {
  return INITIAL;
}

export function subscribeToAuth(listener: () => void): () => void {
  // Starting here means restoration begins with the first reader rather
  // than at import time, so merely importing this module does no work.
  startAuth();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Resolve once auth is no longer `initializing`.
 *
 * For callers outside React that must not act on an unresolved session.
 */
export function whenAuthResolved(): Promise<AuthSnapshot> {
  startAuth();
  if (snapshot.phase !== "initializing") return Promise.resolve(snapshot);
  return new Promise((resolve) => resolvers.push(resolve));
}

/** Test seam. Never called by application code. */
export function __resetAuthForTests(next: AuthSnapshot = INITIAL): void {
  snapshot = next;
  started = false;
  resolvers = [];
  listeners.clear();
}

/** Test seam: drive the controller without a Supabase client. */
export function __emitAuthForTests(next: AuthSnapshot): void {
  started = true;
  emit(next);
}
