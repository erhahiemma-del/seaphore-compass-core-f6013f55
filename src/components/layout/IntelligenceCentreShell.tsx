import type { ReactNode } from "react";
import { useEffect } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { GoToPalette } from "@/components/layout/GoToPalette";
import { GlobalCopilotLauncher } from "@/components/ai/global-copilot-launcher";
import { MapProviderRoot } from "@/lib/maps";
import type { MapProviderName } from "@/lib/maps/types";
import { useThemeStore } from "@/stores/theme.store";

export interface AppShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /**
   * The tone this environment is designed in. Light for Mission Control,
   * Decision Support and Institutional Memory; dark for the intelligence
   * centres — the shift in tone signals the move from monitoring to
   * operational work.
   *
   * A default, not a lock. It decides the appearance until the officer
   * uses the theme toggle, after which their choice holds everywhere.
   */
  mode?: "light" | "dark";
}

const SIDEBAR_STYLE = { "--sidebar-width": "230px" } as React.CSSProperties;

/**
 * Global chrome for every operational screen.
 *
 * Footer principle (immutable):
 *   Evidence first. Explainable always. Officer decides.
 */
export function AppShell({ children, title, subtitle, mode = "light" }: AppShellProps) {
  /*
   * Declare the tone; do not impose it.
   *
   * This used to write `.dark` onto the document itself, which made the
   * shell a second writer of a class `ThemeProvider` already owned. The
   * two raced on effect order, the shell ran second and won, and the
   * theme toggle in the top bar silently did nothing on every screen
   * that declared a mode. The cleanup was worse: removing `.dark` on
   * unmount wiped a preference the officer had actually chosen, so
   * leaving a dark screen reset them to light.
   *
   * The mode is now what it always described itself as — the tone this
   * environment is designed in — and it applies only until the officer
   * says otherwise.
   */
  const setEnvironmentDefault = useThemeStore((s) => s.setEnvironmentDefault);
  useEffect(() => {
    setEnvironmentDefault(mode);
  }, [mode, setEnvironmentDefault]);

  // Provider name will come from a workspace setting once map keys are provisioned.
  // Until then, MockMapProvider satisfies every feature via useMapProvider().
  const mapProvider: MapProviderName =
    (import.meta.env.VITE_MAP_PROVIDER as MapProviderName | undefined) ?? "mock";

  // Embed mode — when a module is loaded inside the Copilot workspace via
  // an iframe (?embed=1), suppress the global chrome so the module renders
  // cleanly beside the persistent Copilot workspace.
  const isEmbedded =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("embed") === "1";

  if (isEmbedded) {
    return (
      <MapProviderRoot provider={mapProvider}>
        <div className="min-h-screen w-full bg-background text-foreground">
          <main className="flex-1">{children}</main>
        </div>
      </MapProviderRoot>
    );
  }

  return (
    <MapProviderRoot provider={mapProvider}>
      <SidebarProvider style={SIDEBAR_STYLE}>
        {/*
          No `dark` class here either. A class scoped to this wrapper
          cannot reach the portals shadcn renders outside it, which is
          how popovers on a dark screen ended up styled for light.
          `ThemeProvider` writes the resolved theme once, at the document.
        */}
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col bg-background">
            <TopBar title={title} subtitle={subtitle} />
            <main className="flex-1 overflow-x-hidden">{children}</main>
            <AppFooter />
            <GoToPalette />
            <GlobalCopilotLauncher />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </MapProviderRoot>
  );
}

function AppFooter() {
  return (
    <footer className="border-t border-line bg-surface-2 px-6 py-3">
      <div className="flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-center">
        <span className="type-label text-foreground/80">
          Evidence first. Explainable always. Officer decides.
        </span>
        <span className="type-small text-slate">
          SEAPHORE · Maritime Intelligence OS · v0.1 Foundation
        </span>
      </div>
    </footer>
  );
}
