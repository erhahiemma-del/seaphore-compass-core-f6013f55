import { Moon, Sun } from "lucide-react";
import { useResolvedTheme, useThemeStore } from "@/stores/theme.store";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  // The resolved theme, not the stored preference: on an environment the
  // officer has never overridden, the control has to describe what is
  // actually on screen or it offers to switch to the theme already shown.
  const theme = useResolvedTheme();
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      data-theme={theme}
      onClick={toggleTheme}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-md text-slate motion-fast",
        "hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
