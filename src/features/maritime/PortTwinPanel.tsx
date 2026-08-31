/**
 * Port Digital Twin controls (Phase 4B).
 *
 * Two rows: which port estate is open, and which of its infrastructure
 * layers are drawn. It is a lens control, not a data surface — the assets
 * themselves are clicked on the map and read in the Context Drawer.
 *
 * ## Why unavailable layers are shown, disabled, with a reason
 *
 * Eight of the eleven specified layers have no connected custodian
 * dataset. Hiding them would leave an officer believing Seaphore has no
 * concept of pipelines or customs zones; showing them as ordinary toggles
 * would let an officer switch one on, see nothing, and conclude the port
 * has none. So each appears with its custodian named and the toggle
 * refused. The gap becomes a procurement item rather than a mystery.
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PORT_TWIN_LAYERS, type PortTwinLayerCoverage } from "@/services/geospatial/port-twin";
import type { PortTwinState } from "./usePortTwin";

export function PortTwinPanel({
  twin,
  className,
  onOpenTwin,
}: {
  readonly twin: PortTwinState;
  readonly className?: string;
  /**
   * Called after a twin is opened, so the host can fly the camera to that
   * port's preset. Optional: the panel changes what is drawn either way.
   */
  readonly onOpenTwin?: (presetId: string) => void;
}) {
  const coverageFor = (layerId: string): PortTwinLayerCoverage | undefined =>
    twin.coverage.find((entry) => entry.layer === layerId);

  return (
    <div
      data-testid="port-twin-panel"
      className={cn(
        "flex flex-col gap-2 border-b border-border/70 bg-card/60 px-3 py-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Port digital twins
        </span>
        {twin.twins.map((candidate) => (
          <Button
            key={candidate.id}
            size="sm"
            variant={twin.openTwin?.id === candidate.id ? "default" : "outline"}
            className="h-6 px-2 text-[11px]"
            data-testid={`port-twin-${candidate.id}`}
            aria-pressed={twin.openTwin?.id === candidate.id}
            onClick={() => {
              const wasOpen = twin.openTwin?.id === candidate.id;
              twin.openPortTwin(candidate.id);
              if (!wasOpen) onOpenTwin?.(candidate.presetId);
            }}
          >
            {candidate.shortName}
          </Button>
        ))}
      </div>

      {twin.openTwin ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-muted-foreground">
            {twin.openTwin.name} — {twin.openTwin.state}. Layers below draw only what a named
            custodian publishes.
          </p>
          <div className="flex flex-wrap gap-1" aria-label="Port infrastructure layers">
            {PORT_TWIN_LAYERS.map((layer) => {
              const coverage = coverageFor(layer.id);
              const pending = !coverage || coverage.status === "pending-source";
              const active = twin.isLayerVisible(layer.id);
              return (
                <button
                  key={layer.id}
                  type="button"
                  disabled={pending}
                  aria-pressed={active}
                  data-testid={`port-twin-layer-${layer.id}`}
                  title={
                    pending
                      ? `Not available. ${coverage?.reason ?? ""} Custodian: ${layer.custodian}.`
                      : `${layer.purpose} Source: ${layer.custodian}.`
                  }
                  onClick={() => twin.toggleLayer(layer.id)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10.5px] font-medium transition-colors",
                    pending
                      ? "cursor-not-allowed border-dashed border-border/60 text-muted-foreground/70"
                      : active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 text-foreground hover:bg-muted/50",
                  )}
                >
                  {layer.label}
                  <span
                    className={cn(
                      "ml-1 text-[9.5px] uppercase tracking-wider",
                      pending ? "" : "text-muted-foreground",
                    )}
                    data-testid={`port-twin-integrity-${layer.id}`}
                  >
                    {pending ? "unavailable" : `${coverage.integrity} ${coverage.assetCount}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
