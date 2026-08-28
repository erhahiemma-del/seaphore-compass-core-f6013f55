/**
 * Maritime — Vessel Intelligence Card.
 *
 * Opens when an officer selects a vessel. Shows what is actually known and is
 * explicit about what is not.
 *
 * Design rule: every field renders. A field with no data shows "Not available"
 * with the reason, rather than being hidden — an officer must be able to tell
 * "this vessel has no registered owner on file" apart from "we forgot to
 * display the owner". Nothing here invents a value.
 *
 * The card no longer reads the vessel object directly. `presentVessel`
 * decides what may be said and why each absence is an absence, so the
 * truthfulness rule lives in one module instead of being re-applied by
 * hand in every section that gets added later.
 */
import { useMemo } from "react";
import { Crosshair, LocateFixed, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import type { Vessel } from "@/services/geospatial";
import type { VesselTrack } from "@/services/geospatial/vessel-track";

import { VesselHero } from "./VesselHero";
import type { ReplayDrawerContext } from "./replay-drawer-state";
import {
  ActivityPanel,
  IntelligencePanel,
  OverviewPanel,
  OwnershipPanel,
  PeoplePanel,
  VesselVoyagePanel,
} from "./VesselIntelligenceSections";
import { presentVessel } from "./vessel-presentation";
import type { FollowState } from "./vessel-camera";

/** The six panels, in the order an officer works through them. */
export const VESSEL_TAB_IDS = [
  "overview",
  "voyage",
  "people",
  "ownership",
  "intelligence",
  "activity",
] as const;

export type VesselTabId = (typeof VESSEL_TAB_IDS)[number];

export const VESSEL_TAB_LABELS: Readonly<Record<VesselTabId, string>> = {
  overview: "Overview",
  voyage: "Voyage",
  people: "People",
  ownership: "Ownership",
  intelligence: "Intelligence",
  activity: "Activity",
};

export interface VesselIntelligenceCardProps {
  readonly vessel: Vessel;
  readonly onClose: () => void;
  /** Which panel to render. `VesselTabs` owns the state; this draws it. */
  readonly tab?: VesselTabId;
  readonly onTabChange?: (tab: VesselTabId) => void;
  /** Centre the map on this vessel through the canonical navigation path. */
  readonly onFocus?: () => void;
  /** Follow state and controls, when the surface supplies a camera. */
  readonly follow?: FollowState;
  readonly onStartFollow?: () => void;
  readonly onStopFollow?: () => void;
  readonly onResumeFollow?: () => void;
  /** Open the existing replay experience for this vessel. */
  readonly onReplay?: () => void;
  /** Set while a recording owns the displayed position. */
  readonly replayContext?: ReplayDrawerContext | null;
  /** Whether the active source can answer questions about this vessel's past. */
  readonly sourceSupportsHistory?: boolean;
  /** The vessel's resolved track, when the archive has been asked. */
  readonly vesselTrack?: VesselTrack | null;
}

export function VesselIntelligenceCard({
  vessel,
  onClose,
  tab = "overview",
  onTabChange,
  onFocus,
  follow,
  onStartFollow,
  onStopFollow,
  onResumeFollow,
  onReplay,
  replayContext,
  sourceSupportsHistory = false,
  vesselTrack,
}: VesselIntelligenceCardProps) {
  /*
   * Derived once per vessel rather than per render. The drawer sits
   * beside a map that repaints continuously, so recomputing the whole
   * presentation on every frame would put avoidable work directly in the
   * path of camera movement.
   */
  const presentation = useMemo(
    () => presentVessel(vessel, { sourceSupportsHistory, track: vesselTrack }),
    [vessel, sourceSupportsHistory, vesselTrack],
  );

  return (
    <aside
      aria-label={`Intelligence for ${vessel.identity.name}`}
      data-testid="vessel-intelligence-card"
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <div className="relative">
        <VesselHero
          vessel={vessel}
          snapshot={presentation.snapshot}
          replayContext={replayContext}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close intelligence card"
          className="absolute right-2 top-2 h-6 w-6"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {/*
        Tabs sit below the hero, not above it: the vessel's identity is
        the anchor an officer returns to, and it must not change as they
        move between panels.
      */}
      <div
        role="tablist"
        aria-label="Vessel view"
        className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-2"
      >
        {VESSEL_TAB_IDS.map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            data-testid={`vessel-tab-${id}`}
            onClick={() => onTabChange?.(id)}
            className={cn(
              "shrink-0 border-b-2 px-2.5 py-1.5 text-[11px] font-medium transition-colors",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {VESSEL_TAB_LABELS[id]}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "overview" ? <OverviewPanel vessel={vessel} presentation={presentation} /> : null}
        {tab === "voyage" ? (
          <VesselVoyagePanel presentation={presentation} onReplay={onReplay} />
        ) : null}
        {tab === "people" ? <PeoplePanel /> : null}
        {tab === "ownership" ? <OwnershipPanel /> : null}
        {tab === "intelligence" ? <IntelligencePanel vessel={vessel} /> : null}
        {tab === "activity" ? <ActivityPanel events={presentation.activity} /> : null}
      </div>

      {/*
        One action, because one action genuinely works.

        The footer used to carry four buttons, all four permanently
        disabled because nothing passed their handlers. Four dead
        controls describe a product rather than offering one. Focus
        routes through the canonical navigation path, so it behaves
        identically whether an officer clicks it or the Copilot calls it.
      */}
      <footer className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            onClick={onFocus}
            disabled={!onFocus}
            title={onFocus ? undefined : "Map navigation is unavailable"}
            className="h-8 flex-1 text-[11.5px]"
          >
            <Crosshair className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Centre
          </Button>

          {/*
            Follow states its own state rather than toggling silently.
            A control that reads "Follow" while following, or resumes on
            its own after a pan, is a control an officer stops trusting.
          */}
          {onStartFollow ? (
            <Button
              size="sm"
              variant={follow === "ACTIVE" ? "default" : "outline"}
              data-testid="vessel-follow"
              data-follow={follow ?? "OFF"}
              onClick={
                follow === "ACTIVE"
                  ? onStopFollow
                  : follow === "PAUSED"
                    ? onResumeFollow
                    : onStartFollow
              }
              className="h-8 flex-1 text-[11.5px]"
            >
              <LocateFixed className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {follow === "ACTIVE" ? "Following" : follow === "PAUSED" ? "Resume" : "Follow"}
            </Button>
          ) : null}
        </div>

        {follow === "PAUSED" ? (
          <p className="mt-1 text-center text-[10px] text-amber-700">
            Follow paused — you moved the map.
          </p>
        ) : null}
        <p className="mt-1.5 text-center text-[9.5px] leading-tight text-muted-foreground/70">
          Every value above is reported by a connected source or marked unavailable.
        </p>
      </footer>
    </aside>
  );
}
