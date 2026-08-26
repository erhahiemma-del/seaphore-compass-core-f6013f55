/**
 * Supporting intelligence, one panel at a time.
 *
 * Four panels stacked in a grid cost four panels' worth of vertical
 * space to show one panel's worth of attention. This shows the panel
 * the lens leads with and keeps the other three one click away — the
 * scroll reduction comes from progressive disclosure, never from
 * removing intelligence.
 *
 * ## What may and may not be hidden
 *
 * These four are *supporting*. Everything above them — orientation, the
 * recommended action, priority intelligence and the map — stays
 * permanently visible, so nothing blocking or critical can be behind a
 * tab. A blocked dependency still surfaces in the action panel whichever
 * supporting panel happens to be open.
 *
 * ## Selection is presentational, and per lens
 *
 * Local component state, because which supporting panel is open is not
 * something another surface needs to know and not something the
 * institution needs to remember. Kept per lens: see
 * `resolveSupportingPanel` for why one global choice and a reset on
 * every mode change are both wrong.
 */
import { useState } from "react";

import { cn } from "@/lib/utils";

import { resolveSupportingPanel } from "./hierarchy";
import { COMPOSABLE_PANELS, orderPanels, type MissionMode, type MissionPanelId } from "./modes";

/** Officer-facing tab labels. Short, because they sit in a row. */
const PANEL_LABEL: Readonly<Record<MissionPanelId, string>> = {
  "revenue-assurance": "Revenue",
  "manifest-intelligence": "Manifest",
  "compliance-watchlist": "Compliance",
  "port-operations": "Ports",
  "maritime-picture": "Map",
  "intelligence-feed": "Intelligence",
  "cargo-workspace": "Cargo",
  "todays-priorities": "Priorities",
  "recent-briefings": "Briefings",
  "focus-rail": "Focus",
};

export function SupportingIntelligence({
  mode,
  panels,
  className,
}: {
  readonly mode: MissionMode;
  /** Renderer per panel id. The panels themselves are unchanged. */
  readonly panels: Readonly<Record<string, React.ReactNode>>;
  readonly className?: string;
}) {
  const [officerChoices, setOfficerChoices] = useState<Partial<Record<string, MissionPanelId>>>({});
  const active = resolveSupportingPanel(mode, officerChoices);
  // Tabs follow the lens's reading order, so the leftmost is the one it
  // considers most relevant.
  const ordered = orderPanels(mode, COMPOSABLE_PANELS);

  return (
    <section
      data-testid="supporting-intelligence"
      aria-label="Supporting intelligence"
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-label shrink-0 text-slate">Supporting intelligence</h2>
        <div
          role="tablist"
          aria-label="Supporting intelligence panel"
          data-testid="supporting-tabs"
          className="flex flex-wrap items-center gap-1"
        >
          {ordered.map((panel) => {
            const selected = panel === active;
            return (
              <button
                key={panel}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`supporting-tab-${panel}`}
                onClick={() => setOfficerChoices((prev) => ({ ...prev, [mode.id]: panel }))}
                className={cn(
                  "rounded border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  selected
                    ? "border-line bg-surface text-foreground"
                    : "border-transparent text-slate hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {PANEL_LABEL[panel]}
              </button>
            );
          })}
        </div>
      </div>

      {/*
        One panel rendered, not four hidden with CSS. Mounting all four
        and hiding three would keep their data subscriptions live for no
        visible benefit, and the point of this region is to cost less.
      */}
      <div data-testid={`supporting-active-${active}`}>{panels[active] ?? null}</div>
    </section>
  );
}
