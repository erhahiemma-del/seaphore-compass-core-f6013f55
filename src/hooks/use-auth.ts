import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { buildMockSession } from "@/lib/dev/dev-mode";
import { useIsDevBypass } from "@/stores/dev-mode.store";

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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [bypass]);

  return { session, loading };
}
