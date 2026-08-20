/**
 * Contextual Intelligence Drawer.
 *
 * The right-hand panel. Dispatches on `MapSelection.kind` and renders the
 * panel that kind deserves.
 *
 * ## Why a dispatch rather than a vessel panel with branches
 *
 * The pre-M2 drawer took a `Vessel` and rendered it. Adding a port would
 * have meant a nullable vessel plus a nullable port plus a flag saying
 * which to read — the same shape that let a port id be read as a vessel
 * id in the state layer.
 *
 * Here the selection is a discriminated union, so each panel receives
 * exactly its own kind and TypeScript rejects a mismatch at compile time.
 * A kind with no panel yet renders an honest placeholder naming what is
 * missing, which is how new entity types plug in without touching this
 * file's neighbours.
 *
 * ## It resolves; it does not fetch
 *
 * A selection is a reference. The drawer asks whichever service owns that
 * kind for the object — the vessel engine for vessels, `services/eo` for
 * detections. Nothing is cached here, so the drawer cannot show a staler
 * copy than the map.
 */
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeSelection, type MapSelection, type Vessel } from "@/services/geospatial";

import { VesselIntelligenceCard } from "./VesselIntelligenceCard";

export interface ContextDrawerProps {
  readonly selection: MapSelection | null;
  /** Resolved vessel, when the selection is a vessel the engine holds. */
  readonly vessel?: Vessel | null;
  readonly onClose: () => void;
  readonly onAskCopilot?: (selection: MapSelection) => void;
  readonly className?: string;
}

export function ContextDrawer({
  selection,
  vessel,
  onClose,
  onAskCopilot,
  className,
}: ContextDrawerProps) {
  if (!selection) return null;

  return (
    <aside
      aria-label="Contextual intelligence"
      data-testid="context-drawer"
      data-selection-kind={selection.kind}
      className={cn(
        "flex w-[380px] shrink-0 flex-col border-l border-border bg-background",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {selection.kind.replace("-", " ")}
          </div>
          <div className="truncate text-[13px] font-semibold text-foreground">
            {describeSelection(selection)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onAskCopilot ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onAskCopilot(selection)}
            >
              Ask Copilot
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Close intelligence drawer"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <SelectionPanel selection={selection} vessel={vessel ?? null} onClose={onClose} />
      </div>
    </aside>
  );
}

/**
 * Route a selection to its panel.
 *
 * The switch is exhaustive over `kind`; a new kind added to the union
 * without a case here is a compile error rather than a blank drawer.
 */
function SelectionPanel({
  selection,
  vessel,
  onClose,
}: {
  selection: MapSelection;
  vessel: Vessel | null;
  onClose: () => void;
}) {
  switch (selection.kind) {
    case "vessel":
      // The vessel is resolved from the engine, not carried on the
      // selection. Absent means the engine has not loaded it — a real
      // state, distinct from "no such vessel".
      return vessel ? (
        <VesselIntelligenceCard vessel={vessel} onClose={onClose} />
      ) : (
        <Unresolved
          title="Vessel not loaded"
          detail="This vessel is selected but is not in the currently loaded set. It may be outside the active viewport, filtered out, or from a provider that is not connected."
        />
      );

    case "port":
    case "terminal":
    case "berth":
    case "anchorage":
      return (
        <PendingPanel
          title="Port intelligence"
          sections={["Overview", "Activity", "Vessels", "Schedule", "Intelligence"]}
          pending={[
            {
              label: "Expected vessels & schedule",
              reason: "NPA SHIPPOS integration awaiting data access.",
            },
            {
              label: "Berth and terminal detail",
              reason: "No connected source publishes berth-level state.",
            },
          ]}
        />
      );

    case "sar-detection":
      return (
        <PendingPanel
          title="SAR detection"
          sections={["Acquisition", "Detection", "AIS correlation", "Evidence"]}
          pending={[
            {
              label: "Detections",
              reason:
                "No SAR ship-detection service is configured. Sentinel-1 scenes can be catalogued, but imagery is not processed, so no detections exist to inspect.",
            },
          ]}
        />
      );

    case "ais-gap":
      return (
        <PendingPanel
          title="AIS gap"
          sections={["Gap", "Reachable area", "Correlation"]}
          pending={[
            {
              label: "AIS history",
              reason:
                "No AIS history provider is connected. Transmission gaps cannot be detected, which is not a statement that no vessel has gone dark.",
            },
          ]}
        />
      );

    case "incident":
      return (
        <PendingPanel
          title="Environmental incident"
          sections={["Incident", "Nearby activity", "Evidence"]}
          pending={[
            {
              label: "NOSDRA incident records",
              reason: "NOSDRA data is technically reachable but its licence has not been reviewed.",
            },
          ]}
        />
      );

    case "investigation":
      return (
        <PendingPanel
          title="Investigation"
          sections={["Evidence", "Entities", "Timeline"]}
          pending={[
            { label: "Investigation workspace", reason: "Delivered in a later milestone." },
          ]}
        />
      );

    default:
      return (
        <Unresolved
          title={`No panel for ${selection.kind}`}
          detail="This object can be selected but has no intelligence panel yet. Nothing is hidden — there is simply nothing connected to show."
        />
      );
  }
}

/**
 * A panel whose sections exist but whose sources do not.
 *
 * Shows the shape of the answer alongside the reason it is empty, so an
 * officer can see what will appear once a source connects — and cannot
 * mistake an unconnected section for a checked-and-empty one.
 */
function PendingPanel({
  title,
  sections,
  pending,
}: {
  title: string;
  sections: readonly string[];
  pending: readonly { label: string; reason: string }[];
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap gap-1">
        {sections.map((section) => (
          <span
            key={section}
            className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {section}
          </span>
        ))}
      </div>

      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>

      <ul className="flex flex-col gap-2">
        {pending.map((item) => (
          <li
            key={item.label}
            className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Pending
              </span>
              <span className="text-[12px] font-medium text-foreground">{item.label}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">{item.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Unresolved({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="p-3">
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
