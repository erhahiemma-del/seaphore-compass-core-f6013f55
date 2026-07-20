/**
 * dev-mode.store — persisted toggle for Development Preview Mode.
 *
 * Persisted in localStorage so refresh keeps the developer's chosen
 * bypass state and mock role. Only consulted in dev builds; production
 * ignores this store entirely.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEV_ENV_BYPASS, DEV_MODE_AVAILABLE } from "@/lib/dev/dev-mode";
import type { OfficerRole } from "@/stores/auth.store";

interface DevModeState {
  bypassAuth: boolean;
  mockRole: OfficerRole;
  setBypassAuth: (v: boolean) => void;
  setMockRole: (r: OfficerRole) => void;
}

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set) => ({
      bypassAuth: DEV_ENV_BYPASS,
      mockRole: "officer",
      setBypassAuth: (bypassAuth) => set({ bypassAuth }),
      setMockRole: (mockRole) => set({ mockRole }),
    }),
    { name: "seaphore.dev-mode.v1" },
  ),
);

/**
 * True when the app should behave as if a mock officer is signed in.
 * Always false outside dev builds.
 */
export function useIsDevBypass(): boolean {
  const bypass = useDevModeStore((s) => s.bypassAuth);
  return DEV_MODE_AVAILABLE && bypass;
}
