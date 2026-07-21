/**
 * dev-mode.store — persisted UX state for the developer role switcher.
 *
 * Preview / development ONLY. `DEV_AUTH_ENABLED` gates every reader:
 * production builds always see `bypassAuth = false` and `useIsDevBypass()
 * = false`, so no mock session can leak into a published deployment.
 *
 * A "mock session" is just:
 *   • bypassAuth: true      — RequireAuth treats the visitor as authenticated
 *   • mockRole: OfficerRole — feeds useRoles / RBAC / Copilot / Policy engine
 *
 * The store is persisted, so the mock session survives refresh until the
 * user signs out (which calls `clearBypass()`).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEV_AUTH_ENABLED } from "@/lib/dev/env";
import type { OfficerRole } from "@/stores/auth.store";

interface DevModeState {
  bypassAuth: boolean;
  mockRole: OfficerRole;
  activateBypass: (r: OfficerRole) => void;
  clearBypass: () => void;
  setMockRole: (r: OfficerRole) => void;
  /** @deprecated use activateBypass / clearBypass */
  setBypassAuth: (v: boolean) => void;
}

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set) => ({
      bypassAuth: false,
      mockRole: "officer",
      activateBypass: (mockRole) => set({ bypassAuth: true, mockRole }),
      clearBypass: () => set({ bypassAuth: false }),
      setMockRole: (mockRole) => set({ mockRole }),
      setBypassAuth: (bypassAuth) => set({ bypassAuth }),
    }),
    { name: "seaphore.dev-mode.v2" },
  ),
);

/**
 * Returns `true` only in preview/development AND when a mock session
 * has been activated via `activateBypass`. Production builds tree-shake
 * the `DEV_AUTH_ENABLED` branch and this hook is a permanent `false`.
 */
export function useIsDevBypass(): boolean {
  const bypassAuth = useDevModeStore((s) => s.bypassAuth);
  return DEV_AUTH_ENABLED && bypassAuth;
}

export { DEV_AUTH_ENABLED as DEV_MODE_AVAILABLE };
