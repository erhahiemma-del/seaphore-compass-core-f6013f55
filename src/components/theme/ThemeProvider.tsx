import { useEffect, type ReactNode } from "react";
import { useThemeStore } from "@/stores/theme.store";

/**
 * Applies the persisted theme preference to <html>. Runs on mount and
 * whenever the store changes. AppShell `mode` overrides take precedence
 * by writing/removing the same class after this effect settles.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);
  return <>{children}</>;
}
