import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemeMode = "light" | "dark";

interface ThemeState {
  /** The officer's own choice. Only meaningful once `preferenceSet` is true. */
  theme: ThemeMode;
  /**
   * Whether the officer has actually chosen, as opposed to never having
   * touched the control. Without this the stored value cannot be told
   * apart from the default, and "light because that is the default" would
   * silently outrank an environment that is designed dark.
   */
  preferenceSet: boolean;
  /**
   * The tone this environment is designed in, supplied by the shell.
   * Used only until the officer expresses a preference.
   */
  environmentDefault: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setEnvironmentDefault: (theme: ThemeMode) => void;
}

/**
 * Theme preference, and the environment tone it falls back to.
 *
 * ## Why there are two values instead of one
 *
 * Screens are designed in a tone: Mission Control and the officer
 * workspaces are light, the intelligence centres are dark. That used to
 * be enforced by `AppShell` writing `.dark` onto `<html>` directly, which
 * made the shell a second writer of the same class as `ThemeProvider` —
 * they raced on effect order, the shell won, and the theme toggle in the
 * top bar did nothing on any screen that declared a mode. Worse, the
 * shell's cleanup removed `.dark` on unmount, so navigating away from a
 * dark screen wiped a preference the officer had actually set.
 *
 * Splitting the two restores the ordinary rule: an environment states
 * how it is meant to look, and the officer overrides it. Nothing here
 * writes to the document — {@link ThemeProvider} is the only writer.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      preferenceSet: false,
      environmentDefault: "light",
      setTheme: (theme) => set({ theme, preferenceSet: true }),
      toggleTheme: () =>
        set({ theme: resolveTheme(get()) === "dark" ? "light" : "dark", preferenceSet: true }),
      setEnvironmentDefault: (environmentDefault) => set({ environmentDefault }),
    }),
    {
      name: "seaphore.theme",
      version: 2,
      // Only the officer's choice survives a reload. `environmentDefault`
      // belongs to whichever screen is mounted and must not outlive it.
      partialize: (state) => ({ theme: state.theme, preferenceSet: state.preferenceSet }),
      migrate: (persisted) => {
        const legacy = persisted as Partial<ThemeState> | undefined;
        if (!legacy) return { theme: "light" as ThemeMode, preferenceSet: false };
        /*
         * A stored "dark" could only have come from the officer pressing
         * the toggle — the default has always been light — so it is a
         * real preference. A stored "light" is indistinguishable from
         * never having chosen, and is treated as the latter so that the
         * environments designed dark keep looking the way they do today.
         */
        return {
          theme: legacy.theme ?? "light",
          preferenceSet: legacy.preferenceSet ?? legacy.theme === "dark",
        };
      },
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

/**
 * What should actually be on screen: the officer's choice if they have
 * made one, otherwise the tone this environment is designed in.
 */
export function resolveTheme(
  state: Pick<ThemeState, "theme" | "preferenceSet" | "environmentDefault">,
): ThemeMode {
  return state.preferenceSet ? state.theme : state.environmentDefault;
}

/** Subscribe to the resolved theme. */
export function useResolvedTheme(): ThemeMode {
  return useThemeStore(resolveTheme);
}
