/**
 * Development-only Quick Login — signs into a real seeded Supabase
 * account (`{role}@seaphore.local`) via `signInWithPassword`.
 *
 * Because the session is real, every downstream code path — server
 * functions with `requireSupabaseAuth`, RLS policies scoped to
 * `auth.uid()`, `useRoles`, `RequireAuth` — works unmodified. There
 * is no mock session or client-side bypass to fall back to.
 *
 * Guarded by `DEV_AUTH_ENABLED`. In production builds the guard is
 * `false` and callers throw; Rollup then tree-shakes this module.
 */
import { supabase } from "@/integrations/supabase/client";
import { DEV_AUTH_ENABLED, DEV_SEED_PASSWORD, devRole, type DevRoleKey } from "./env";

export interface QuickLoginFailure {
  ok: false;
  stage: "guard" | "signin" | "session";
  message: string;
  cause?: unknown;
  fix: string;
}
export interface QuickLoginSuccess {
  ok: true;
  role: DevRoleKey;
  landingPath: string;
  elapsedMs: number;
}
export type QuickLoginResult = QuickLoginSuccess | QuickLoginFailure;

export async function quickLoginAs(role: DevRoleKey): Promise<QuickLoginResult> {
  if (!DEV_AUTH_ENABLED) {
    return {
      ok: false,
      stage: "guard",
      message: "Quick Login is disabled in production builds.",
      fix: "Use standard credentials on the login form.",
    };
  }

  const def = devRole(role);
  const start = performance.now();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: def.email,
    password: DEV_SEED_PASSWORD,
  });

  if (error) {
    return {
      ok: false,
      stage: "signin",
      message: error.message,
      cause: error,
      fix:
        error.message.toLowerCase().includes("invalid")
          ? "Dev accounts may not be seeded yet. Re-run the seed migration or verify the DEV_SEED_PASSWORD matches the migration."
          : "Check Supabase reachability and that email auth is enabled.",
    };
  }
  if (!data.session) {
    return {
      ok: false,
      stage: "session",
      message: "signInWithPassword returned no session.",
      fix: "Confirm Supabase Auth is enabled and the account is email-confirmed.",
    };
  }

  return {
    ok: true,
    role,
    landingPath: def.landingPath,
    elapsedMs: Math.round(performance.now() - start),
  };
}
