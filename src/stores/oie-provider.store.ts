/**
 * OIE reasoning-provider selection — persisted per officer.
 *
 * The store never stores model API keys or provider secrets — only the
 * chosen provider id. Swapping providers routes the NEXT briefing
 * through a different brain; existing briefings are untouched.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PROVIDER_ID, type ReasoningProviderId } from "@/services/oie/reasoning-provider";

interface OIEProviderState {
  providerId: ReasoningProviderId;
  setProvider: (id: ReasoningProviderId) => void;
}

export const useOIEProviderStore = create<OIEProviderState>()(
  persist(
    (set) => ({
      providerId: DEFAULT_PROVIDER_ID,
      setProvider: (id) => set({ providerId: id }),
    }),
    { name: "seaphore.oie-provider.v1" },
  ),
);
