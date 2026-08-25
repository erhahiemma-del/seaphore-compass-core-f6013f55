/**
 * Maritime — contextual asset card.
 *
 * The card an officer gets when they click something on the National
 * Maritime Picture. It reads the shared `MapSelection` and resolves it
 * against the registries and the live vessel snapshot the canvas already
 * holds; it owns no selection state of its own and stores nothing.
 *
 * ## What it may and may not say
 *
 * Identity and position come from a registry or an observation, so they
 * are printed. Everything an officer might *want* — occupancy, port
 * calls, congestion — is an observation that requires a connected feed.
 * Where that feed is absent the row stays, and reads "Awaiting data".
 * Removing the row would quietly turn "not measured" into "nothing
 * there", which is the one thing this surface must never do.
 */
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MAP_SYMBOLS, type MapSymbolKind } from "@/lib/map-symbols";
import { cn } from "@/lib/utils";
import {
  anchoragesForPort,
  distanceKm,
  findAnchorage,
  findPort,
  formatAge,
  freshnessBandForTimestamp,
  freshnessLabel,
  type MapSelection,
  type Vessel,
} from "@/services/geospatial";

/** Radius within which a vessel is counted as "at" a port or anchorage. */
const NEARBY_RADIUS_KM = 12;

/** Card width in pixels — fixed, so the anchoring maths is stable. */
const CARD_WIDTH = 288;

export interface AssetPopupProps {
  readonly selection: MapSelection;
  /** Live vessel snapshot the canvas already holds. Never re-fetched here. */
  readonly vessels: readonly Vessel[];
  /** Container-pixel anchor. Null anchors to the top-right corner. */
  readonly point: { readonly x: number; readonly y: number } | null;
  readonly onClose: () => void;
  /** Route to the larger map. Absent hides the "Open full map" action. */
  readonly fullMapHref?: string;
}

interface Row {
  readonly label: string;
  readonly value: string;
  /** Marks a value we could not observe, so it can be styled as absent. */
  readonly absent?: boolean;
}

const AWAITING = "Awaiting data";

function row(label: string, value: string | null | undefined): Row {
  return value === null || value === undefined || value === ""
    ? { label, value: AWAITING, absent: true }
    : { label, value };
}

function coords(lon: number, lat: number): string {
  return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}°${
    lon >= 0 ? "E" : "W"
  }`;
}

/** Vessels currently observed within {@link NEARBY_RADIUS_KM} of a point. */
function nearbyVessels(
  vessels: readonly Vessel[],
  at: readonly [number, number],
): readonly Vessel[] {
  return vessels.filter(
    (v) => distanceKm([v.position.lon, v.position.lat], at) <= NEARBY_RADIUS_KM,
  );
}

interface CardModel {
  readonly kind: MapSymbolKind;
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly rows: readonly Row[];
  /** Where the card points on the map. */
  readonly at: readonly [number, number] | null;
  readonly actions: readonly { readonly label: string; readonly href: string }[];
  /** Provenance line, always present — the officer sees where this came from. */
  readonly source: string;
}

function portCard(id: string, vessels: readonly Vessel[]): CardModel | null {
  const port = findPort(id);
  if (!port) return null;
  const at: readonly [number, number] = [port.lon, port.lat];
  const anchorages = anchoragesForPort(port.locode);
  const near = nearbyVessels(vessels, at);
  const observed = vessels.length > 0;

  return {
    kind: "port",
    eyebrow: port.tier === "major" ? "Major port complex" : "Port / terminal",
    title: port.name,
    subtitle: `${port.locode} · ${port.state} State`,
    at,
    rows: [
      row("Location", `${port.state} State`),
      row("Berths (reference)", String(port.berths)),
      // A count of what the connected feed shows, never a claim about the
      // whole port: the sentence names the observation, not the truth.
      observed
        ? row("Vessels observed nearby", `${near.length} within ${NEARBY_RADIUS_KM} km`)
        : row("Vessels observed nearby", null),
      row("Anchorage", anchorages.length > 0 ? anchorages.map((a) => a.name).join(", ") : null),
      // Deliberately unanswerable today. No connected source publishes
      // NPA operational status, port calls or congestion.
      row("Operational status", null),
      row("Port calls (24 h)", null),
      row("Congestion", null),
      row("Alerts", null),
    ],
    actions: [
      { label: "View port", href: `/ports?port=${port.locode}` },
      { label: "Open full map", href: "/maritime" },
    ],
    source: `Position: ${port.verification === "npa-reference" ? "NPA reference" : "chart reference"} · ${coords(port.lon, port.lat)}`,
  };
}

function anchorageCard(id: string, vessels: readonly Vessel[]): CardModel | null {
  const area = findAnchorage(id);
  if (!area) return null;
  const at: readonly [number, number] = [area.lon, area.lat];
  const near = nearbyVessels(vessels, at);
  const observed = vessels.length > 0;
  const port = area.portId ? findPort(area.portId) : null;

  return {
    kind: "anchorage",
    eyebrow: "Anchorage / waiting area",
    title: area.name,
    subtitle: area.district,
    at,
    rows: [
      row("Pilotage district", area.district),
      row("Associated port", port?.name ?? null),
      row("Indicative radius", `${area.radiusKm} km (display hint)`),
      observed
        ? row("Vessels observed inside", `${near.length} within ${NEARBY_RADIUS_KM} km`)
        : row("Vessels observed inside", null),
      // Occupancy is a measurement of a defined area against a complete
      // feed. Seaphore has neither, so it stays unanswered.
      row("Occupancy", null),
      row("Status", null),
    ],
    actions: [
      ...(port ? [{ label: "View port", href: `/ports?port=${port.locode}` }] : []),
      { label: "Open full map", href: "/maritime" },
    ],
    source: `${area.source} · ${coords(area.lon, area.lat)}`,
  };
}

function vesselCard(selection: MapSelection, vessels: readonly Vessel[]): CardModel | null {
  if (selection.kind !== "vessel") return null;
  const vessel =
    vessels.find((v) => v.identity.imo === selection.id) ??
    vessels.find((v) => v.identity.mmsi === selection.id) ??
    null;

  if (!vessel) {
    // The object was on the map, so it existed. Say that, rather than
    // closing the card as if nothing had been clicked.
    return {
      kind: "vessel",
      eyebrow: "Vessel",
      title: selection.imo ?? selection.id,
      subtitle: null,
      at: selection.focus ?? null,
      rows: [row("Observation", null)],
      actions: [{ label: "Open full map", href: "/maritime" }],
      source: "Observation no longer in the current snapshot",
    };
  }

  const band = freshnessBandForTimestamp(vessel.position.timestamp);
  const age = Date.now() - Date.parse(vessel.position.timestamp);

  return {
    kind: "vessel",
    eyebrow: "Vessel",
    title: vessel.identity.name,
    subtitle: [
      vessel.identity.imo ? `IMO ${vessel.identity.imo}` : null,
      vessel.identity.mmsi ? `MMSI ${vessel.identity.mmsi}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    at: [vessel.position.lon, vessel.position.lat],
    rows: [
      row("Flag", vessel.identity.flag),
      row("Last known position", coords(vessel.position.lon, vessel.position.lat)),
      row("Speed", vessel.position.speed > 0 ? `${vessel.position.speed.toFixed(1)} kn` : null),
      row("Heading", Number.isFinite(vessel.position.heading) ? `${Math.round(vessel.position.heading)}°` : null),
      row("Destination", vessel.position.destination ?? null),
      // Berth/port association needs a port-call feed; none is connected.
      row("Associated port", null),
      // UNKNOWN means unassessed, not clean — so it reads as absent.
      row("Risk", vessel.riskLevel === "UNKNOWN" ? null : vessel.riskLevel),
      row("Freshness", `${freshnessLabel(band)} · ${formatAge(age)}`),
    ],
    actions: [
      { label: "View vessel", href: `/vessel?imo=${vessel.identity.imo}` },
      { label: "Investigate", href: `/investigate/open?subject=${vessel.identity.imo}` },
      { label: "Open full map", href: "/maritime" },
    ],
    source: vessel.provenance
      ? `${vessel.provenance.provider} · observed ${formatAge(age)} ago`
      : "Source unattributed",
  };
}

function cardFor(selection: MapSelection, vessels: readonly Vessel[]): CardModel | null {
  switch (selection.kind) {
    case "port":
      return portCard(selection.id, vessels);
    case "anchorage":
      return anchorageCard(selection.id, vessels);
    case "vessel":
      return vesselCard(selection, vessels);
    default:
      return null;
  }
}

export function AssetPopup({
  selection,
  vessels,
  point,
  onClose,
  fullMapHref,
}: AssetPopupProps) {
  const card = cardFor(selection, vessels);
  if (!card) return null;

  const symbol = MAP_SYMBOLS[card.kind];
  const actions = card.actions.filter(
    (a) => a.label !== "Open full map" || fullMapHref !== undefined,
  );

  const style = point
    ? {
        left: Math.max(8, point.x - CARD_WIDTH / 2),
        top: Math.max(8, point.y + 18),
        width: CARD_WIDTH,
      }
    : { right: 12, top: 12, width: CARD_WIDTH };

  return (
    <div
      role="dialog"
      aria-label={`${card.eyebrow}: ${card.title}`}
      data-testid="map-asset-popup"
      className="absolute z-30 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-xl"
      style={style}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4">
            <path d={symbol.path} fill={symbol.color} />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {card.eyebrow}
          </p>
          <p className="truncate text-sm font-semibold leading-snug">{card.title}</p>
          {card.subtitle ? (
            <p className="truncate text-[11px] text-muted-foreground">{card.subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <dl className="mt-2.5 space-y-1">
        {card.rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 text-[11px]">
            <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
            <dd
              className={cn(
                "truncate text-right font-medium",
                r.absent && "font-normal italic text-muted-foreground",
              )}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2.5 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
        {card.source}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <Button key={action.label} asChild size="sm" variant="outline" className="h-7 text-[11px]">
            <Link to={action.label === "Open full map" ? (fullMapHref ?? action.href) : action.href}>
              {action.label} →
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
