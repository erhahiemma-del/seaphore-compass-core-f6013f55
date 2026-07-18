import type { ReactNode } from "react";
import { useEffect } from "react";

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { GlobalCopilotLauncher } from "@/components/ai/global-copilot-launcher";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /**
   * Per-section mode. Light for Mission Control, Decision Support, Share,
   * Institutional Memory. Dark for the Intelligence Centres. The mode is
   * per-section, not user-toggled — the visual change signals the shift
   * from monitoring to operational work.
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
export function AppShell({
  children,
  title,
  subtitle,
  mode = "light",
}: AppShellProps) {
  // Toggle document-level dark class so shadcn dark tokens apply everywhere,
  // including popovers/portals that render outside the shell tree.
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    return () => root.classList.remove("dark");
  }, [mode]);

  return (
    <SidebarProvider style={SIDEBAR_STYLE}>
      <div
        className={cn(
          "flex min-h-screen w-full bg-background text-foreground",
          mode === "dark" && "dark",
        )}
      >
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-background">
          <TopBar title={title} subtitle={subtitle} />
          <main className="flex-1 overflow-x-hidden">{children}</main>
          <AppFooter />
          <GlobalCopilotLauncher />
        </SidebarInset>
      </div>
    </SidebarProvider>
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
