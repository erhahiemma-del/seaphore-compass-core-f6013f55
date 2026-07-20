import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemeMode = "light" | "dark";

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

/**
 * Global user theme preference — persisted to localStorage so the choice
 * survives reloads. Per-section design modes (see AppShell `mode` prop)
 * are considered explicit overrides; when no override is supplied the
 * ThemeProvider applies this stored preference to <html>.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    {
      name: "seaphore.theme",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            },
      ),
    },
  ),
);
