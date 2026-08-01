/**
 * logout — canonical sign-out cleanup.
 *
 * Order matters (per tanstack-auth-guards "Sign-Out Hygiene"):
 *   1. cancel in-flight queries — stops 401 storms after signOut
 *   2. clear cached protected data — prevents Back-button restore
 *   3. supabase.auth.signOut() — clears session tokens (localStorage + cookies)
 *   4. router.navigate({ to: "/auth", replace: true, search: { redirect: undefined } }) — REPLACE so back nav
 *      cannot land back on a protected route
 *
 * Security: this only clears client state. RLS + server-side
 * requireSupabaseAuth remain authoritative. Never rely on client-side
 * cleanup to protect data at rest.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useDevModeStore } from "@/stores/dev-mode.store";

export async function performLogout(opts: {
  queryClient: QueryClient;
  router: AnyRouter;
}): Promise<void> {
  try {
    await opts.queryClient.cancelQueries();
  } catch {
    /* non-fatal */
  }
  opts.queryClient.clear();
  // Clear any dev-mode mock session first so RequireAuth stops treating
  // the visitor as authenticated the moment we land on /auth.
  useDevModeStore.getState().clearBypass();
  await supabase.auth.signOut();
  opts.router.navigate({ to: "/auth", replace: true, search: {} as { redirect: string } });
}
