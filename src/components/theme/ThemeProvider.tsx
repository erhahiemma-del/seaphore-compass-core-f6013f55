import { useEffect, type ReactNode } from "react";
import { useResolvedTheme } from "@/stores/theme.store";

/**
 * The only writer of `.dark` on the document.
 *
 * `AppShell` used to write the same class from its `mode` prop. Two
 * writers of one class race on effect order: the shell ran second and
 * won, so the theme toggle in the top bar had no visible effect on any
 * screen that declared a mode, and the shell's unmount cleanup removed
 * `.dark` — wiping a preference the officer had set. Both are gone.
 * An environment now declares its tone through
 * `setEnvironmentDefault`, and this resolves tone against preference and
 * writes the result once.
 *
 * Writing at the document rather than on a wrapper element is
 * deliberate: popovers, dialogs and tooltips render through portals
 * outside the shell tree, and a class scoped to a wrapper would leave
 * them styled for the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useResolvedTheme();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);
  return <>{children}</>;
}
