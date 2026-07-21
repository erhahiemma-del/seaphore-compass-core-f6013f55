/**
 * dev-mode.store — persisted UX state for the developer role switcher.
 *
 * The `bypassAuth` field is DEPRECATED and permanently `false`. The old
 * client-side session bypass was replaced by real seeded accounts
 * (`{role}@seaphore.local`) authenticated through Supabase. See
 * `src/lib/dev/quick-login.ts` and `src/lib/dev/env.ts`.
 *
 * Retained fields:
 *  - `mockRole`: the role the floating Role Switcher last selected
 *    (used only for UI hint labels; never for authorization).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEV_AUTH_ENABLED } from "@/lib/dev/env";
import type { OfficerRole } from "@/stores/auth.store";

interface DevModeState {
  bypassAuth: false;
  mockRole: OfficerRole;
  setBypassAuth: (v: boolean) => void;
  setMockRole: (r: OfficerRole) => void;
}

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set) => ({
      bypassAuth: false as const,
      mockRole: "officer",
      // No-op: the old bypass is gone. Kept for API compat with legacy call sites.
      setBypassAuth: () => set({ bypassAuth: false as const }),
      setMockRole: (mockRole) => set({ mockRole }),
    }),
    { name: "seaphore.dev-mode.v2" },
  ),
);

/**
 * DEPRECATED — always returns `false`. Retained only so legacy call
 * sites compile until they are cleaned up. New code should not consult
 * this hook.
 */
export function useIsDevBypass(): boolean {
  return false;
}

export { DEV_AUTH_ENABLED as DEV_MODE_AVAILABLE };
