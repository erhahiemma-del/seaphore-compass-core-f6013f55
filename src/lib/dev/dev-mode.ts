/**
 * Development Preview Mode.
 *
 * Env flag: `VITE_DEV_BYPASS_AUTH=true` — when true (and only in dev
 * builds), the app auto-authenticates as a mock officer, skips all
 * client-side auth guards, and never redirects to `/auth`.
 *
 * Runtime override: the DevToolbar toggles a localStorage key so the
 * bypass can be flipped without touching env vars. The env var wins on
 * first load; after that the store's persisted value takes over.
 *
 * IMPORTANT: This is a client-side UX bypass ONLY. RLS + server-side
 * `requireSupabaseAuth` remain authoritative. Production behavior is
 * unchanged because `import.meta.env.DEV` is false in production
 * builds — the bypass flag is force-disabled there.
 */
import type { Session, User } from "@supabase/supabase-js";

import type { OfficerRole } from "@/stores/auth.store";

// Available in dev server AND in non-production builds (e.g. Lovable preview
// `build:dev`), so the "Continue as Admin" affordance shows up on the preview
// URL. Production builds (`import.meta.env.PROD === true`) disable it.
export const DEV_MODE_AVAILABLE = !import.meta.env.PROD;

export const DEV_ENV_BYPASS =
  DEV_MODE_AVAILABLE && String(import.meta.env.VITE_DEV_BYPASS_AUTH ?? "") === "true";

export const MOCK_OFFICER_ID = "00000000-0000-0000-0000-0000000d0dev".slice(0, 36);

export const MOCK_OFFICER_EMAIL = "dev.officer@nimasa.local";
export const MOCK_OFFICER_NAME = "Dev Officer (Preview Mode)";

export function buildMockUser(): User {
  return {
    id: MOCK_OFFICER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: MOCK_OFFICER_EMAIL,
    email_confirmed_at: new Date(0).toISOString(),
    phone: "",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    app_metadata: { provider: "dev-bypass", providers: ["dev-bypass"] },
    user_metadata: { full_name: MOCK_OFFICER_NAME, dev_bypass: true },
    identities: [],
  } as unknown as User;
}

export function buildMockSession(): Session {
  const user = buildMockUser();
  return {
    access_token: "dev-bypass-token",
    refresh_token: "dev-bypass-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  } as unknown as Session;
}

export const DEV_ROLES: OfficerRole[] = [
  "analyst",
  "officer",
  "director",
  "admin",
  "external_agency",
];
