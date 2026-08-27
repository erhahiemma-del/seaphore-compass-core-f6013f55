/**
 * Where the officer is, and the way back out.
 *
 * A map that can fly anywhere needs to say where "anywhere" currently is.
 * The trail is derived from the camera rather than maintained alongside
 * it, so it cannot drift: pan by hand and the level follows, fly through
 * a control and the place is named.
 *
 * Deliberately small. It is orientation, not a panel — one line over the
 * map, and each step is a way back out rather than a label.
 */
import { cn } from "@/lib/utils";
import { allPlaces, levelForZoom, trailTo, type Place } from "@/services/geospatial/places";
import { navigateTo } from "@/services/geospatial/navigation";
import { sgs, useMapSelector, type SharedGeospatialService } from "@/services/geospatial";

const LEVEL_LABEL: Readonly<Record<string, string>> = {
  GLOBAL: "Global",
  REGIONAL: "Region",
  MARITIME_AREA: "Maritime area",
  COUNTRY: "Country",
  PORT: "Port",
  LOCAL: "Local",
  ENTITY: "Entity",
};

/**
 * The nearest declared place to where the camera is.
 *
 * Distance in degrees is crude and correct enough for orientation: the
 * trail answers "roughly where am I", and a projection-accurate nearest
 * neighbour would cost more than the question is worth.
 */
function nearestPlace(center: readonly [number, number], zoom: number): Place | null {
  const level = levelForZoom(zoom);
  const candidates = trailCandidates(level);
  let best: Place | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const place of candidates) {
    const dx = place.center[0] - center[0];
    const dy = place.center[1] - center[1];
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = place;
    }
  }
  return best;
}

function trailCandidates(level: string): readonly Place[] {
  // Match the officer's altitude: at country zoom the nearest *port* is
  // not what they are looking at.
  const wanted =
    level === "GLOBAL"
      ? ["GLOBAL"]
      : level === "REGIONAL" || level === "MARITIME_AREA"
        ? ["REGIONAL", "MARITIME_AREA"]
        : level === "COUNTRY"
          ? ["COUNTRY"]
          : ["PORT"];
  return placesAtLevels(wanted);
}

function placesAtLevels(levels: readonly string[]): readonly Place[] {
  return allPlaces().filter((place) => levels.includes(place.level));
}

export function SpatialTrail({
  service = sgs,
  className,
}: {
  readonly service?: SharedGeospatialService;
  readonly className?: string;
}) {
  const zoom = useMapSelector((state) => state.zoom, service);
  const lon = useMapSelector((state) => state.center[0], service);
  const lat = useMapSelector((state) => state.center[1], service);

  const here = nearestPlace([lon, lat], zoom);
  const trail = here ? trailTo(here) : [];
  const level = levelForZoom(zoom);

  if (trail.length === 0) return null;

  return (
    <nav
      aria-label="Spatial context"
      data-testid="spatial-trail"
      className={cn(
        "pointer-events-auto flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] backdrop-blur-sm",
        "border border-border/60 text-muted-foreground",
        className,
      )}
    >
      {trail.map((place, index) => (
        <span key={place.id} className="flex items-center gap-1">
          {index > 0 ? (
            <span aria-hidden className="opacity-40">
              /
            </span>
          ) : null}
          <button
            type="button"
            data-trail-step={place.id}
            onClick={() => navigateTo({ place: place.id, source: "control" }, service)}
            className={cn(
              "rounded px-0.5 transition-colors hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]",
              index === trail.length - 1 && "text-foreground",
            )}
          >
            {place.name}
          </button>
        </span>
      ))}
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <span className="text-muted-foreground/80">{LEVEL_LABEL[level] ?? level}</span>
    </nav>
  );
}
