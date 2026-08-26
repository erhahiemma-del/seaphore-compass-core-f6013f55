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
import { ContextRail } from "@/components/layout/ContextRail";
import { CommandSurfaceHost } from "@/features/command/CommandSurfaceHost";
import { MissionModeSelector } from "@/features/mission-control/MissionModeSelector";
import { useCopilotContextBinding } from "@/features/mission-control/useCopilotContextBinding";
import { useMissionMode } from "@/features/mission-control/useMissionMode";
import { cn } from "@/lib/utils";

/**
 * What an environment opts into.
 *
 * One shell, optional capabilities, environment-specific content — not
 * one shell per environment. Before this, the command surface, the
 * mission-mode lens, the focus rail and the Copilot context binding were
 * mounted by Mission Control and by nothing else, so every other
 * environment either went without them or would have had to re-mount its
 * own copy. These are the switches that let an environment take them
 * from the shell instead.
 *
 * Every one defaults to `false`. A shell that quietly turned capabilities
 * on would put controls in front of officers that the environment behind
 * them cannot honour, which is the "empty control" failure this codebase
 * treats as worse than an absent one.
 */
export interface ShellCapabilities {
  /** The shared search and command surface, above the content. */
  readonly commandSurface?: boolean;
  /** The mission-mode lens selector, in the shell header. */
  readonly missionMode?: boolean;
  /** The focused-subject rail, beside the content. */
  readonly focus?: boolean;
  /** Publish mission mode and focus to Copilot. Renders nothing. */
  readonly copilotContext?: boolean;
  /**
   * Map-dominant content: the environment owns the full area below the
   * top bar, with no footer and no scroll container of its own.
   *
   * For surfaces where chrome costs the officer the thing they came for
   * — Maritime Command's full-bleed map. It suppresses the footer only;
   * the sidebar, top bar and palette stay, because navigation is not
   * chrome.
   */
  readonly chromeless?: boolean;
}

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
  /** Opt-in shell capabilities. Everything defaults off. */
  capabilities?: ShellCapabilities;
  /**
   * Environment-specific actions, rendered in the shell header beside the
   * mission-mode selector. Content, not a boolean — there is nothing
   * generic to render when an environment has no actions.
   */
  pageActions?: ReactNode;
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
  capabilities,
  pageActions,
}: AppShellProps) {
  const {
    commandSurface = false,
    missionMode = false,
    focus = false,
    copilotContext = false,
    chromeless = false,
  } = capabilities ?? {};
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

            {/*
              The header strip exists only when something asked for it.
              An empty bordered strip reads as a control area that failed
              to load rather than one that was never requested.
            */}
            {(missionMode || pageActions) && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-5 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  {missionMode && <ShellMissionMode />}
                </div>
                {pageActions && <div className="flex items-center gap-2">{pageActions}</div>}
              </div>
            )}

            {commandSurface && (
              <div className="border-b border-line bg-surface px-5 py-2">
                <CommandSurfaceHost />
              </div>
            )}

            {/*
              `chromeless` hands the whole area below to the environment:
              no footer, and `min-h-0` so a full-height map can size
              itself against the flex parent instead of overflowing it.
            */}
            <div className={cn("flex min-h-0 flex-1", focus ? "gap-4" : undefined)}>
              <main
                className={cn(
                  "min-w-0 flex-1",
                  chromeless ? "flex min-h-0 flex-col" : "overflow-x-hidden",
                )}
              >
                {children}
              </main>
              {focus && <ContextRail className="my-4 mr-4 hidden lg:block" />}
            </div>

            {copilotContext && <CopilotContextBinding />}
            {!chromeless && <AppFooter />}
            <GoToPalette />
            <GlobalCopilotLauncher />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </MapProviderRoot>
  );
}

/**
 * The mission-mode lens, bound to the one mission-mode store.
 *
 * The selector is controlled, and the store already exists — this binds
 * the two rather than holding a second copy of the active mode.
 */
function ShellMissionMode() {
  const { modeId, setModeId } = useMissionMode();
  return <MissionModeSelector value={modeId} onChange={setModeId} />;
}

/**
 * Publishes mission mode and focus to Copilot.
 *
 * A component rather than a bare hook call because hooks cannot be
 * called conditionally and this capability is opt-in. It renders
 * nothing; the binding is the whole point.
 */
function CopilotContextBinding() {
  useCopilotContextBinding();
  return null;
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
