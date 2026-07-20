import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { buildMockSession, DEV_MODE_AVAILABLE } from "@/lib/dev/dev-mode";
import { useIsDevBypass, useDevModeStore } from "@/stores/dev-mode.store";

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

/**
 * Session hook. Registers onAuthStateChange first, then reads the current
 * session — the canonical pattern for Lovable Cloud auth.
 *
 * Dev bypass: when Development Preview Mode is on, returns a mock officer
 * session immediately and skips Supabase entirely (client-side only).
 *
 * Dev fallback: in dev builds, if Supabase getSession() fails or times out,
 * auto-enable bypass so the app stays usable when the backend is unreachable.
 */
export function useAuth(): AuthState {
  const bypass = useIsDevBypass();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (bypass) {
      setSession(buildMockSession());
      setLoading(false);
      return;
    }
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) setSession(next);
    });

    const fallbackTimer =
      DEV_MODE_AVAILABLE && typeof window !== "undefined"
        ? window.setTimeout(() => {
            if (cancelled) return;
            useDevModeStore.getState().setBypassAuth(true);
          }, 4000)
        : null;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setLoading(false);
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        if (DEV_MODE_AVAILABLE) useDevModeStore.getState().setBypassAuth(true);
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      });

    return () => {
      cancelled = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      sub.subscription.unsubscribe();
    };
  }, [bypass]);

  return { session, loading };
}
