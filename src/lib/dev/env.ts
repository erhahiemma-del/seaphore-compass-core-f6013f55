/**
 * Development-mode environment gate — SINGLE SOURCE OF TRUTH.
 *
 * `DEV_AUTH_ENABLED` is a compile-time constant derived from Vite's
 * `import.meta.env.PROD`. In production builds it becomes `false` and
 * every `if (DEV_AUTH_ENABLED) { ... }` branch is dead-code eliminated
 * by Rollup — dev components, quick-login credentials, and the command
 * palette never enter the production bundle.
 *
 * Verified at build time by `scripts/verify-prod-bundle.mjs`.
 */
export const IS_DEV_BUILD = !import.meta.env.PROD;

/**
 * True on Lovable preview/sandbox hosts (id-preview--*.lovable.app,
 * *-dev.lovable.app, project--*-dev.lovable.app, localhost). Published
 * production domains — the final `*.lovable.app` slug and custom
 * domains — return false, so the dev role cards never render there.
 */
function isPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h.startsWith("id-preview--")) return true;
  if (h.endsWith("-dev.lovable.app")) return true;
  if (h.endsWith(".lovableproject.com")) return true;
  return false;
}

export const DEV_AUTH_ENABLED = IS_DEV_BUILD || isPreviewHost();

/** Fixed dev seed password — matches the SQL migration. */
export const DEV_SEED_PASSWORD = "SeaphoreDev!2026";

export type DevRoleKey = "admin" | "director" | "officer" | "analyst";

export interface DevRoleDefinition {
  readonly key: DevRoleKey;
  readonly email: `${string}@seaphore.local`;
  readonly label: string;
  readonly landingPath: string;
  readonly permissionsSummary: string;
}

export const DEV_ROLES: readonly DevRoleDefinition[] = [
  {
    key: "admin",
    email: "admin@seaphore.local",
    label: "Administrator",
    landingPath: "/admin",
    permissionsSummary: "Full platform control · user/role management · audit",
  },
  {
    key: "director",
    email: "director@seaphore.local",
    label: "Director",
    landingPath: "/",
    permissionsSummary: "Strategic command · cross-agency briefings · audit review",
  },
  {
    key: "officer",
    email: "officer@seaphore.local",
    label: "Officer",
    landingPath: "/command-center",
    permissionsSummary: "Investigations · decisions · briefings · team audit",
  },
  {
    key: "analyst",
    email: "analyst@seaphore.local",
    label: "Analyst",
    landingPath: "/detect",
    permissionsSummary: "Signals · evidence · investigations (read/create)",
  },
];

export function devRole(key: DevRoleKey): DevRoleDefinition {
  const found = DEV_ROLES.find((r) => r.key === key);
  if (!found) throw new Error(`Unknown dev role: ${key}`);
  return found;
}
