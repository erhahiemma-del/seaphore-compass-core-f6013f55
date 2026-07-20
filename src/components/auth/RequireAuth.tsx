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

import { useAuth } from "@/hooks/use-auth";
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";

const PUBLIC_PREFIXES = ["/auth", "/api/public"] as const;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const publicPath = isPublicPath(location.pathname);

  useEffect(() => {
    if (loading || publicPath) return;
    if (!session) {
      // TanStack Router's `location.search` is a parsed object — use `href`
      // (already-serialized path + search + hash) for the redirect target.
      navigate({
        to: "/auth",
        search: { redirect: location.href },
        replace: true,
      });
    }
  }, [loading, publicPath, session, location.href, navigate]);

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
