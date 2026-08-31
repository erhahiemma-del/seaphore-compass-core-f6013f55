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
import { useCallback, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReplayDrawerContext } from "./replay-drawer-state";
import {
  describeSelection,
  distanceKm,
  type MapSelection,
  type Vessel,
  type Voyage,
  findNigerianPort,
  hasDrawablePosition,
  positionUnavailableReason,
} from "@/services/geospatial";
import {
  findPortTwinAsset,
  portTwinLayer,
  type PortTwinAsset,
} from "@/services/geospatial/port-twin";
import type { VesselCamera } from "./useVesselCamera";

import { VesselIntelligenceCard, type VesselTabId } from "./VesselIntelligenceCard";
import { useMarineWeather } from "./use-marine-weather";
import { useVesselEnrichment } from "./use-vessel-enrichment";
import type { VesselTrack } from "@/services/geospatial/vessel-track";
import { VoyagePanel } from "./VoyagePanel";

export interface ContextDrawerProps {
  readonly selection: MapSelection | null;
  /** Resolved vessel, when the selection is a vessel the engine holds. */
  readonly vessel?: Vessel | null;
  /**
   * The canonical fleet currently loaded.
   *
   * Used only to count vessels standing at a selected piece of port
   * infrastructure. Passed in rather than fetched so the drawer can never
   * show a different fleet from the map — and so "no vessels here" is
   * always a statement about the loaded set, never about the world.
   */
  readonly fleet?: readonly Vessel[];
  /** Whether the active vessel source keeps an archive. Passed through. */
  readonly sourceSupportsHistory?: boolean;
  /** The selected vessel's resolved track, when one has been asked for. */
  readonly vesselTrack?: VesselTrack | null;
  /**
   * Resolved voyage, when the selection is a voyage.
   *
   * Three states, not two: `undefined` while resolving, `null` when the
   * lookup finished and found nothing, and a `Voyage` when it did. The
   * panel renders each differently, because "still loading" and "no
   * connected source holds this" are not the same message.
   */
  readonly voyage?: Voyage | null;
  readonly onClose: () => void;
  /**
   * Follow a vessel's declared destination to that port.
   *
   * Optional: surfaces without a selection dispatcher render the port
   * context without the action rather than a button that does nothing.
   */
  readonly onOpenPort?: (selection: MapSelection) => void;
  readonly onAskCopilot?: (selection: MapSelection) => void;
  /** Shared camera, so Centre and Follow measure the same usable map. */
  readonly camera?: VesselCamera;
  /** Open the existing replay experience for this vessel. */
  readonly onReplay?: () => void;
  readonly replayAvailable?: boolean;
  /** Set while a recording owns the displayed position. */
  readonly replayContext?: ReplayDrawerContext | null;
  readonly className?: string;
}

export function ContextDrawer({
  selection,
  vessel,
  voyage,
  fleet,
  onClose,
  onOpenPort,
  onAskCopilot,
  className,
  sourceSupportsHistory,
  vesselTrack,
  camera,
  onReplay,
  replayAvailable,
  replayContext,
}: ContextDrawerProps) {
  if (!selection) return null;

  return (
    <aside
      aria-label="Contextual intelligence"
      data-testid="context-drawer"
      data-selection-kind={selection.kind}
      className={cn(
        /*
          Widened from 380px to 520px for the six-tab workspace.

          Safe because the framing correction measures this element's
          real rect at run time rather than reading a constant — the one
          design decision that lets the panel grow without the selected
          vessel silently drifting under it.
        */
        /*
          And `relative z-30`, because the drawer must own its own
          pixels. The map's spatial-context breadcrumb lives in an
          absolute `z-20` layer that overflows past the canvas, and with
          the drawer statically positioned it painted straight over the
          vessel name — the panel's primary anchor, covered by a
          neighbour. Measured, not guessed: `elementFromPoint` over the
          heading returned the breadcrumb's `nav`.
        */
        "relative z-30 flex w-[520px] shrink-0 flex-col border-l border-border bg-background",
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
        <SelectionPanel
          onOpenPort={onOpenPort}
          fleet={fleet}
          selection={selection}
          vessel={vessel ?? null}
          voyage={voyage}
          onClose={onClose}
          sourceSupportsHistory={sourceSupportsHistory}
          vesselTrack={vesselTrack}
          camera={camera}
          onReplay={onReplay}
          replayAvailable={replayAvailable}
          replayContext={replayContext}
        />
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
  fleet,
  voyage,
  onClose,
  onOpenPort,
  sourceSupportsHistory,
  vesselTrack,
  camera,
  onReplay,
  replayAvailable,
  replayContext,
}: {
  selection: MapSelection;
  vesselTrack?: VesselTrack | null;
  vessel: Vessel | null;
  fleet?: readonly Vessel[];
  sourceSupportsHistory?: boolean;
  camera?: VesselCamera;
  onReplay?: () => void;
  replayAvailable?: boolean;
  replayContext?: ReplayDrawerContext | null;
  /** `undefined` means still resolving; `null` means resolved to nothing. */
  voyage: Voyage | null | undefined;
  onClose: () => void;
  /** Follow a declared destination to its port. Absent disables the action. */
  onOpenPort?: (selection: MapSelection) => void;
}) {
  switch (selection.kind) {
    case "vessel":
      // The vessel is resolved from the engine, not carried on the
      // selection. Absent means the engine has not loaded it — a real
      // state, distinct from "no such vessel".
      return vessel ? (
        <VesselTabs
          onOpenPort={onOpenPort}
          vessel={vessel}
          onClose={onClose}
          sourceSupportsHistory={sourceSupportsHistory}
          vesselTrack={vesselTrack}
          camera={camera}
          onReplay={onReplay}
          replayAvailable={replayAvailable}
          replayContext={replayContext}
        />
      ) : (
        <Unresolved
          title="Vessel not loaded"
          detail="This vessel is selected but is not in the currently loaded set. It may be outside the active viewport, filtered out, or beyond the movement data currently available."
        />
      );

    case "voyage":
      // Resolved by the host, like the vessel above — the selection
      // carries a reference, never the record.
      return <VoyagePanel voyage={voyage ?? null} loading={voyage === undefined} />;

    case "port":
    case "terminal":
    case "berth":
    case "anchorage": {
      /*
       * Resolved through the canonical model, never by display name.
       *
       * The selection carries a UN/LOCODE; this turns it into the port's
       * identity and its geographic status. A port the model does not
       * recognise still renders the pending panel — it is a real
       * selection of something we simply hold no estate record for.
       */
      const canonical = selection.kind === "port" ? findNigerianPort(selection.id) : null;
      return (
        <PendingPanel
          title={canonical ? canonical.name : "Port intelligence"}
          sections={["Overview", "Activity", "Vessels", "Schedule", "Intelligence"]}
          pending={[
            /*
             * A port with no coordinate says so here, first.
             * Otherwise an officer who selected Rivers from the card
             * list and saw nothing appear on the map would be left to
             * conclude the selection failed.
             */
            ...(canonical && !hasDrawablePosition(canonical)
              ? [
                  {
                    label: "Geographic position",
                    reason: positionUnavailableReason(canonical),
                  },
                ]
              : []),
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
    }

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
                "Transmission gaps cannot be detected from the movement data available, which is not a statement that no vessel has gone dark.",
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

    case "infrastructure": {
      /*
       * Resolved from the port-twin model by asset id, exactly as a port
       * is resolved from the canonical registry. An asset the model does
       * not hold is a real selection of something unrecorded, so it falls
       * through to the pending panel rather than rendering an empty card.
       */
      const asset = findPortTwinAsset(selection.id);
      return asset ? (
        <InfrastructurePanel asset={asset} fleet={fleet ?? []} />
      ) : (
        <PendingPanel
          title="Port infrastructure"
          sections={["Asset", "Capacity", "Connected vessels", "Compliance"]}
          pending={[
            {
              label: `Asset record (${selection.assetType})`,
              reason:
                "This asset is not in the port Digital Twin model. No connected custodian dataset describes it.",
            },
          ]}
        />
      );
    }


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
 * Vessel drawer with an Overview / Intelligence split.
 *
 * Overview is the existing identity card, unchanged. Intelligence runs
 * the risk-module registry over the vessel and renders the brief. Two
 * tabs rather than one long scroll: an officer opening a vessel usually
 * wants one or the other, and stacking them buries whichever they came
 * for.
 */
function VesselTabs({
  vessel,
  onClose,
  onOpenPort,
  sourceSupportsHistory,
  vesselTrack,
  camera,
  onReplay,
  replayAvailable,
  replayContext,
}: {
  vessel: Vessel;
  onClose: () => void;
  onOpenPort?: (selection: MapSelection) => void;
  sourceSupportsHistory?: boolean;
  vesselTrack?: VesselTrack | null;
  camera?: VesselCamera;
  onReplay?: () => void;
  replayAvailable?: boolean;
  replayContext?: ReplayDrawerContext | null;
}) {
  const [tab, setTab] = useState<VesselTabId>("overview");

  /*
   * The deep load, bought once for the vessel an officer actually opened.
   *
   * Keyed on IMO through React Query, so the drawer, the Copilot and any
   * other surface asking about this vessel share one request rather than
   * each buying the same answer.
   */
  const {
    enrichment,
    loading: enrichmentLoading,
    failed: enrichmentFailed,
  } = useVesselEnrichment(vessel.identity.imo || null);

  /*
   * Sea state where this vessel is, on the same one-request-per-selection
   * terms as the enrichment. The position is rounded onto a coarse grid
   * before it becomes a query key, so two vessels in one anchorage share
   * the answer rather than buying it twice.
   */
  const weather = useMarineWeather({
    lat: vessel.position.lat,
    lon: vessel.position.lon,
  });

  /*
   * Centre goes through the shared camera, which measures the drawer and
   * the left rail before deciding where to move. The previous version
   * centred on the raw coordinate, which put the vessel behind the very
   * panel describing it.
   */
  const onFocus = camera?.centre;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <VesselIntelligenceCard
        vessel={vessel}
        onClose={onClose}
        tab={tab}
        onTabChange={setTab}
        onFocus={onFocus}
        follow={camera?.follow}
        onStartFollow={camera?.startFollow}
        onStopFollow={camera?.stopFollow}
        onResumeFollow={camera?.resumeFollow}
        onOpenPort={onOpenPort}
        enrichment={enrichment}
        weather={weather}
        enrichmentLoading={enrichmentLoading}
        enrichmentFailed={enrichmentFailed}
        onReplay={replayAvailable ? onReplay : undefined}
        replayContext={replayContext}
        sourceSupportsHistory={sourceSupportsHistory}
        vesselTrack={vesselTrack}
      />
    </div>
  );
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
