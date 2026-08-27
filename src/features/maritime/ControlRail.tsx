/**
 * Maritime Command control rail and its drawers.
 *
 * Presentation over existing state. Every control writes through the
 * Shared Geospatial Service and reads the existing layer registry — there
 * is no second map state, no filter store, and no layer catalogue here.
 *
 * The Vessel Filters drawer is the only one that currently changes the
 * map, and it changes it for real: each control writes `MapState.filters`,
 * which the update engine reads when it projects vessels to the renderer.
 * A control whose data does not exist opens a drawer that says so and
 * offers nothing to press, which is the honest shape of a capability
 * Seaphore models but cannot yet serve.
 */
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sgs, useMapSelector, type SharedGeospatialService } from "@/services/geospatial";
import {
  EMPTY_FILTERS,
  PENDING_FILTER_DIMENSIONS,
  activeFilterChips,
  activeFilterCount,
  type MapFilters,
  type PositionAgeWindow,
} from "@/services/geospatial/vessel-filter";
import type { VesselType } from "@/services/geospatial/types";

import { CONTROL_STATUS_LABEL, MAP_CONTROLS, type MapControlDefinition } from "./control-rail";
import { useFullscreen } from "./use-fullscreen";
import { LayerPanel } from "./LayerPanel";
import { MapStyleDrawer } from "./MapStyleDrawer";

/**
 * Ship types the canonical vessel record can actually carry.
 *
 * Five, not the nine a maritime reference product shows. The extra four
 * would be controls that silently match nothing, because the model has no
 * value for them to match.
 */
const SHIP_TYPES: readonly { value: VesselType; label: string }[] = [
  { value: "CONTAINER", label: "Container" },
  { value: "TANKER", label: "Tanker" },
  { value: "BULK", label: "Bulk carrier" },
  { value: "VEHICLE", label: "Vehicle carrier" },
  { value: "OTHER", label: "Other / unspecified" },
];

const POSITION_AGES: readonly { value: PositionAgeWindow; label: string }[] = [
  { value: "1H", label: "Last hour" },
  { value: "6H", label: "Last 6 hours" },
  { value: "24H", label: "Last 24 hours" },
  { value: "OLDER", label: "Older than 24 hours" },
];

const RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export interface ControlRailProps {
  readonly service?: SharedGeospatialService;
  readonly className?: string;
  /**
   * The workspace Full Screen expands.
   *
   * Passed in rather than discovered, because the element that should
   * grow is the whole Maritime Command shell — chrome, rail and map —
   * and only the surface that composes them knows which that is.
   */
  readonly fullscreenTarget?: React.RefObject<HTMLElement | null>;
}

export function ControlRail({ service = sgs, className, fullscreenTarget }: ControlRailProps) {
  const [openControl, setOpenControl] = useState<string | null>(null);
  const fallbackTarget = useRef<HTMLElement | null>(null);
  const fullscreen = useFullscreen(fullscreenTarget ?? fallbackTarget);
  const filters = useMapSelector((state) => state.filters, service);
  const activeCount = activeFilterCount(filters);

  /*
   * Full Screen is an action, not a drawer.
   *
   * It was routed through the same open-a-panel path as everything
   * else, which is how a control marked ready came to open an
   * explanation of itself instead of doing the thing it names.
   */
  const toggle = useCallback(
    (id: string) => {
      if (id === "full-screen") {
        fullscreen.toggle();
        return;
      }
      setOpenControl((current) => (current === id ? null : id));
    },
    [fullscreen],
  );

  return (
    <div className={cn("pointer-events-auto flex items-start gap-2", className)}>
      <div
        role="toolbar"
        aria-label="Map controls"
        aria-orientation="vertical"
        className="flex flex-col gap-0.5 rounded-xl bg-[#0B2350] p-1.5 shadow-[0_10px_24px_-10px_rgba(6,22,48,0.7)] ring-1 ring-white/10"
      >
        {MAP_CONTROLS.map((control) => (
          <RailButton
            key={control.id}
            control={control}
            open={control.id === "full-screen" ? fullscreen.active : openControl === control.id}
            badge={control.id === "vessel-filters" && activeCount > 0 ? activeCount : null}
            onClick={() => toggle(control.id)}
          />
        ))}
      </div>

      {openControl ? (
        <Drawer
          control={MAP_CONTROLS.find((c) => c.id === openControl)!}
          service={service}
          filters={filters}
          onClose={() => setOpenControl(null)}
        />
      ) : null}
    </div>
  );
}

function RailButton({
  control,
  open,
  badge,
  onClick,
}: {
  control: MapControlDefinition;
  open: boolean;
  badge: number | null;
  onClick: () => void;
}) {
  const Icon = control.icon;
  const unavailable = control.status === "pending-source" || control.status === "unavailable";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={
        unavailable ? `${control.label} — ${CONTROL_STATUS_LABEL[control.status]}` : control.label
      }
      title={control.pendingReason ?? control.description}
      data-control={control.id}
      data-status={control.status}
      className={cn(
        "relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]",
        open ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
        // Dimmed, never hidden: an officer should be able to see that
        // Seaphore models the capability and read why it cannot serve it.
        unavailable && "text-white/40",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {badge !== null ? (
        <span
          data-testid="active-filter-badge"
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[10px] font-semibold text-white"
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function Drawer({
  control,
  service,
  filters,
  onClose,
}: {
  control: MapControlDefinition;
  service: SharedGeospatialService;
  filters: MapFilters;
  onClose: () => void;
}) {
  return (
    <section
      data-testid={`control-drawer-${control.id}`}
      aria-label={control.label}
      className={cn(
        "max-w-[calc(100vw-6rem)] rounded-xl bg-white/95 p-3 shadow-[0_10px_28px_-12px_rgba(6,22,48,0.55)] ring-1 ring-black/10 backdrop-blur dark:bg-[#0E1D2C]/95 dark:ring-white/10",
        // Layers carries a search field and grouped rows; the filter
        // drawer is a column of controls and reads better narrower.
        control.id === "layers" ? "max-h-[70vh] w-[21rem] overflow-y-auto" : "w-[19rem]",
      )}
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{control.label}</h2>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClose}>
          Close
        </Button>
      </header>

      {control.id === "vessel-filters" ? (
        <VesselFilters service={service} filters={filters} />
      ) : control.id === "map-style" ? (
        <MapStyleDrawer service={service} />
      ) : control.id === "layers" ? (
        <LayerPanel service={service} />
      ) : (
        <UnavailableDrawer control={control} />
      )}
    </section>
  );
}

/**
 * What a control with no data behind it says.
 *
 * The reason, not a spinner and not an empty list. An officer who opens
 * Weather needs to learn that Seaphore has no meteorological provider —
 * which is a procurement fact, not a loading state.
 */
function UnavailableDrawer({ control }: { control: MapControlDefinition }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {CONTROL_STATUS_LABEL[control.status]}
      </p>
      <p className="text-sm text-muted-foreground">
        {control.pendingReason ?? control.description}
      </p>
    </div>
  );
}

function VesselFilters({
  service,
  filters,
}: {
  service: SharedGeospatialService;
  filters: MapFilters;
}) {
  const chips = activeFilterChips(filters);
  const set = (patch: Partial<MapFilters>) => service.setFilters(patch);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {chips.length === 0
            ? "Showing every reported vessel"
            : `${chips.length} active filter${chips.length === 1 ? "" : "s"}`}
        </p>
        {chips.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            data-testid="clear-filters"
            onClick={() => service.setFilters(EMPTY_FILTERS)}
          >
            Clear all
          </Button>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <li
              key={chip.key}
              className="rounded bg-[#EAF3FB] px-1.5 py-0.5 text-[11px] font-medium text-[#1F6FB2] dark:bg-[#10263A] dark:text-[#69AAE3]"
            >
              {chip.label}
            </li>
          ))}
        </ul>
      ) : null}

      <Group label="Ship Type">
        <select
          aria-label="Ship Type"
          data-testid="filter-ship-type"
          value={filters.vesselType}
          onChange={(e) => set({ vesselType: e.target.value as MapFilters["vesselType"] })}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
        >
          <option value="ALL">All ship types</option>
          {SHIP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Group>

      <Group label="Other Particulars">
        <input
          aria-label="IMO, MMSI, call sign or name"
          data-testid="filter-identifier"
          value={filters.identifier}
          placeholder="IMO, MMSI, call sign or name"
          onChange={(e) => set({ identifier: e.target.value })}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
        />
        <input
          aria-label="Flag"
          data-testid="filter-flag"
          value={filters.flag === "ALL" ? "" : filters.flag}
          placeholder="Flag state"
          onChange={(e) => set({ flag: e.target.value === "" ? "ALL" : e.target.value })}
          className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-xs"
        />
      </Group>

      <Group label="Risk">
        <select
          aria-label="Risk level"
          data-testid="filter-risk"
          value={filters.riskLevel}
          onChange={(e) => set({ riskLevel: e.target.value as MapFilters["riskLevel"] })}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
        >
          <option value="ALL">Any risk level</option>
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Group>

      <Group label="Voyage">
        <input
          aria-label="Destination"
          data-testid="filter-destination"
          value={filters.destination === "ALL" ? "" : filters.destination}
          placeholder="Declared destination"
          onChange={(e) => set({ destination: e.target.value === "" ? "ALL" : e.target.value })}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
        />
      </Group>

      <Group label="Last Position Received">
        <select
          aria-label="Last position received"
          data-testid="filter-position-age"
          value={filters.positionAge}
          onChange={(e) => set({ positionAge: e.target.value as PositionAgeWindow })}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
        >
          <option value="ALL">Any time</option>
          {POSITION_AGES.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </Group>

      {/*
        Named, not omitted.

        An officer who cannot find a draught filter should learn that
        Seaphore holds no draught, rather than conclude they missed it.
      */}
      <div className="border-t pt-2" data-testid="pending-filter-dimensions">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pending source
        </p>
        <ul className="space-y-1">
          {PENDING_FILTER_DIMENSIONS.map((dimension) => (
            <li key={dimension.group} className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">{dimension.group}</span> —{" "}
              {dimension.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium">{label}</p>
      {children}
    </div>
  );
}
