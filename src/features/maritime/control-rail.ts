/**
 * The Maritime Command control rail — what an officer can do to the map.
 *
 * Declared as data rather than assembled in JSX so the set can be
 * asserted: exactly these ten controls, each exactly once, each with a
 * status that says whether it does anything yet.
 *
 * ## The rail is operational, not diagnostic
 *
 * Nothing here reports provider health, answerability, freshness
 * statistics or connector state. Those are real and they belong in Data
 * Sources, where an officer goes to ask why a feed is quiet. Above the
 * filters they were the first thing on screen, which made the primary map
 * surface read as a status page for a system rather than an instrument
 * for looking at the sea.
 *
 * ## Status is about the control, not the connection
 *
 * `ready` means pressing it changes the map today. `pending-source` means
 * the control is correctly built and the data behind it does not exist —
 * an honest empty drawer, never a fabricated one. `unavailable` means it
 * cannot be offered here at all. The three are different answers to
 * "why is nothing happening", and collapsing them leaves an officer
 * unable to tell a gap from a fault.
 */
import type { LucideIcon } from "lucide-react";
import {
  Anchor,
  Cloud,
  Crosshair,
  Filter,
  Layers,
  Maximize2,
  Palette,
  History,
  Route,
  Star,
} from "lucide-react";

/** Whether pressing this control does anything yet. */
export type ControlStatus = "ready" | "limited" | "pending-source" | "unavailable";

export interface MapControlDefinition {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly status: ControlStatus;
  /** One line an officer reads before pressing it. */
  readonly description: string;
  /** Why it cannot act yet. Required for anything not `ready`. */
  readonly pendingReason?: string;
}

/**
 * The canonical rail, in the order an officer works down it.
 *
 * Presentation first (what the map looks like), then population (which
 * entities), then analysis (what patterns), then the viewport itself.
 */
export const MAP_CONTROLS: readonly MapControlDefinition[] = [
  {
    id: "map-style",
    label: "Map Style",
    icon: Palette,
    status: "ready",
    description: "Institutional or maritime dark presentation.",
  },
  {
    id: "layers",
    label: "Layers",
    icon: Layers,
    status: "ready",
    description: "What is drawn on the map.",
  },
  {
    id: "vessel-filters",
    label: "Vessel Filters",
    icon: Filter,
    status: "ready",
    description: "Which vessels qualify to be shown.",
  },
  {
    id: "watchlists",
    label: "Watchlists",
    icon: Star,
    status: "pending-source",
    description: "Vessels an officer is keeping under observation.",
    pendingReason:
      "No watchlist store exists. A list that vanished on reload would be worse than none, so nothing here pretends to persist.",
  },
  {
    id: "weather",
    label: "Weather",
    icon: Cloud,
    status: "pending-source",
    description: "Wind, sea state and visibility over the operating area.",
    pendingReason:
      "Operational weather is not currently available. Nothing here is estimated, because a forecast nobody observed is not weather.",
  },
  {
    id: "density",
    label: "Density",
    icon: Crosshair,
    status: "pending-source",
    description: "Where traffic, activity or risk concentrates.",
    pendingReason:
      "Density is an aggregation over position history. Nothing retains a track archive, so there is nothing to aggregate.",
  },
  {
    id: "replay",
    label: "Replay",
    icon: History,
    status: "limited",
    description: "Move the picture back through recorded observations.",
    pendingReason:
      "The player works and records what this session observed. No historical track source is connected, so there is no archive to scrub before the map was opened.",
  },
  {
    id: "voyage-intelligence",
    label: "Voyage Intelligence",
    icon: Route,
    status: "limited",
    description: "Declared voyages, their ports and what is not recorded.",
    pendingReason:
      "Voyage endpoints are known where a port resolves. The path between them is not recorded, and each voyage says so rather than drawing a line nobody observed.",
  },
  {
    id: "spatial-tools",
    label: "Spatial Tools",
    icon: Anchor,
    status: "pending-source",
    description: "Measure distance and area, mark an investigation area.",
    pendingReason:
      "Measurement is not implemented, and drawn geometry has nowhere to persist. Annotations need the investigation and audit path before they can be saved.",
  },
  {
    id: "full-screen",
    label: "Full Screen",
    icon: Maximize2,
    status: "ready",
    description: "Expand the map without remounting it.",
  },
] as const;

/** Look one up. Undefined is a programming error, not a runtime state. */
export function findControl(id: string): MapControlDefinition | undefined {
  return MAP_CONTROLS.find((control) => control.id === id);
}

/** Controls that do something today. */
export function readyControls(): readonly MapControlDefinition[] {
  return MAP_CONTROLS.filter((control) => control.status === "ready");
}

/**
 * Officer-facing status word.
 *
 * Kept here so the rail, the drawer heading and any future summary all
 * say the same thing about the same control.
 */
export const CONTROL_STATUS_LABEL: Readonly<Record<ControlStatus, string>> = {
  ready: "Ready",
  limited: "Limited",
  "pending-source": "Not available",
  unavailable: "Unavailable",
};
