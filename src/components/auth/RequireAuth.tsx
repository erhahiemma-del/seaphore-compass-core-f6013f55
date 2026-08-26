/**
 * RequireAuth — client-side route guard.
 *
 * Redirects unauthenticated visitors of any protected route to `/auth`,
 * preserving the intended destination in the `redirect` query param so
 * the login flow can resume it after successful sign-in.
 *
 * PUBLIC ROUTES (no auth required):
 *   - /auth (the login screen itself)
 *   - /api/public/* (server routes handle their own auth)
 *
 * SECURITY: This is a UX guard, not an authorization boundary. RLS +
 * server-side `requireSupabaseAuth` are authoritative. Anyone can call
 * a protected server function; RLS will reject unauthorized reads.
 */
import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { useAuth, useAuthPhase } from "@/hooks/use-auth";
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";
import { useIsDevBypass } from "@/stores/dev-mode.store";

const PUBLIC_PREFIXES = ["/auth", "/api/public"] as const;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const bypass = useIsDevBypass();
  const { session, loading } = useAuth();
  const phase = useAuthPhase();
  const location = useLocation();
  const navigate = useNavigate();

  const publicPath = bypass || isPublicPath(location.pathname);

  useEffect(() => {
    // A failed restoration is not a signed-out officer. Redirecting on
    // error would send someone whose session could not be *read* to the
    // sign-in screen, where signing in again is unlikely to help and the
    // real fault stays invisible.
    if (loading || publicPath || phase === "error") return;
    if (!session) {
      // TanStack Router's `location.search` is a parsed object — use `href`
      // (already-serialized path + search + hash) for the redirect target.
      navigate({
        to: "/auth",
        search: { redirect: location.href },
        replace: true,
      });
    }
  }, [loading, publicPath, phase, session, location.href, navigate]);

  /*
   * Restoration failed — a state of its own.
   *
   * Previously this was indistinguishable from being signed out: the old
   * hook's `catch` set `loading = false` with a null session, so an
   * officer whose session could not be read was bounced to sign-in as
   * though they had logged out. Naming it stops the retry loop and shows
   * the actual fault.
   */
  if (!publicPath && phase === "error") {
    return (
      <div
        role="alert"
        data-testid="auth-error"
        className="flex min-h-screen items-center justify-center bg-background px-6"
      >
        <div className="w-full max-w-md border-l-2 border-destructive pl-5">
          <p className="text-xs font-semibold uppercase text-destructive">Authentication error</p>
          <h1 className="mt-2 text-lg font-semibold text-foreground">
            Your session could not be verified
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This is not a sign-out. The session store could not be read, so no intelligence was
            loaded and no protected request was made.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // While the session is loading and we're on a protected path, avoid
  // rendering children — protected UI can flash before the redirect.
  if (!publicPath && loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"
      >
        <span className="sr-only">Verifying session…</span>
        <span aria-hidden>Verifying session…</span>
      </div>
    );
  }
  if (!publicPath && !session) return null;

  return (
    <>
      {children}
      {session && !publicPath ? <TimeoutHost /> : null}
    </>
  );
}

function TimeoutHost() {
  const { warning, remainingMs, reset } = useSessionTimeout();
  return <SessionTimeoutWarning open={warning} remainingMs={remainingMs} onExtend={reset} />;
}
