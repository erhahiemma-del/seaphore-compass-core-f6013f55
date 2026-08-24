import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { hasBackendBrowserConfig } from "@/lib/backend-browser-config";

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

/**
 * Session hook — registers `onAuthStateChange` first, then reads the
 * current session (the canonical Supabase pattern).
 *
 * No client-side bypass, no mock sessions, no silent fallback timers.
 * Dev "quick login" uses real seeded accounts (`{role}@seaphore.local`)
 * so `useAuth` sees a real session and every server-side check
 * (`requireSupabaseAuth`, RLS scoped to `auth.uid()`) works unmodified.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasBackendBrowserConfig()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) setSession(next);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[Seaphore auth] getSession failed:", err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
