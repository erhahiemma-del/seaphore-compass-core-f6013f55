/**
 * Legacy dev-mode helpers.
 *
 * The client-side mock-session bypass has been removed — dev login now
 * uses real Supabase accounts (`{role}@seaphore.local`). This module
 * retains a few constants that other files still import; nothing here
 * fabricates a session.
 */
import { DEV_AUTH_ENABLED } from "@/lib/dev/env";
import type { OfficerRole } from "@/stores/auth.store";

export const DEV_MODE_AVAILABLE = DEV_AUTH_ENABLED;
export const DEV_ENV_BYPASS = false;

export const DEV_ROLES: OfficerRole[] = [
  "analyst",
  "officer",
  "director",
  "admin",
  "external_agency",
];
