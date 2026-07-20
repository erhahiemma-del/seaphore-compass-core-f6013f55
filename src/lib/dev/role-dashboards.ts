/**
 * Preview-mode role → landing dashboard map.
 * Used by the "Mission Access" role cards and the floating Role Switcher
 * so each role opens directly into its command surface.
 */
import type { OfficerRole } from "@/stores/auth.store";

export const ROLE_DASHBOARDS: Record<
  Extract<OfficerRole, "admin" | "director" | "officer" | "analyst">,
  { url: string; label: string }
> = {
  admin: { url: "/admin", label: "Executive Dashboard" },
  director: { url: "/", label: "Strategic Command" },
  officer: { url: "/command-center", label: "Operations Dashboard" },
  analyst: { url: "/detect", label: "Intelligence Dashboard" },
};
