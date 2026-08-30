/**
 * The picture at the top of a selected vessel.
 *
 * An officer who has just clicked a ship wants to know what kind of ship
 * it is before reading a single field, and a picture answers that faster
 * than a table. It is also the most persuasive way this application could
 * mislead: a photograph reads as evidence, so a picture of *some* tanker
 * above the name of *this* tanker reads as a picture of this one.
 *
 * Everything below follows from that. The badge in the corner states what
 * the image is entitled to claim, the alt text says the same thing to a
 * screen reader, and a reference illustration is drawn rather than
 * photographed so it cannot be mistaken for a capture even at a glance.
 *
 * ## Why the class references are vector, not photographs
 *
 * A stock photograph of a real tanker used as a stand-in is a picture of
 * a specific, identifiable, real ship — shown under another vessel's
 * name. A drawn silhouette depicts no particular hull and cannot be
 * mistaken for one. Real photography of a real vessel belongs here only
 * when a source supplies it *for that vessel*.
 *
 * ## Races
 *
 * An officer clicking A then B faster than the network answers will
 * otherwise see A's photograph land under B's name. Every load is checked
 * against the vessel that is currently selected before it is allowed to
 * appear.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";

import { hasReportedImo } from "@/services/geospatial/vessel";
import { cn } from "@/lib/utils";
import {
  IMAGE_KIND_BADGE,
  IMAGE_KIND_DETAIL,
  categoryPhrase,
  depictsThisVessel,
  resolveVesselImage,
  type VesselImage,
  type VesselImagerySource,
} from "@/services/geospatial/vessel-imagery";
import type { VesselIdentity } from "@/services/geospatial/vessel";
import type { VesselVisualCategory } from "@/services/geospatial/vessel-visual";

/**
 * URLs that failed this session.
 *
 * Module-level and deliberately not cleared: a link that 404s will 404
 * again, and retrying it on every reselection produces a panel that
 * flickers through a broken state each time an officer returns to the
 * same vessel.
 */
const failedUrls = new Set<string>();

/**
 * Class figures, drawn.
 *
 * Side profiles at a common waterline so switching between vessels does
 * not make the horizon jump. Deliberately spare — this is a recognition
 * aid, not an illustration, and detail here would read as specificity the
 * figure does not have.
 */
function VesselFigure({ category }: { readonly category: VesselVisualCategory }) {
  const hull = "M8 40 L112 40 L104 52 L16 52 Z";
  return (
    <svg
      viewBox="0 0 120 64"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
      aria-hidden
    >
      <g className="fill-current text-muted-foreground/45">
        <path d={hull} />
        {category === "CONTAINER" ? (
          <>
            <rect x="22" y="28" width="60" height="11" />
            <rect x="22" y="20" width="44" height="7" />
            <rect x="88" y="22" width="14" height="17" />
          </>
        ) : null}
        {category === "TANKER" ? (
          <>
            <rect x="20" y="33" width="66" height="6" />
            <rect x="88" y="20" width="16" height="19" />
            <rect x="40" y="26" width="4" height="7" />
            <rect x="60" y="26" width="4" height="7" />
          </>
        ) : null}
        {category === "BULK" ? (
          <>
            <rect x="20" y="32" width="62" height="7" />
            <rect x="86" y="21" width="16" height="18" />
            {[28, 44, 60].map((x) => (
              <rect key={x} x={x} y="24" width="10" height="8" />
            ))}
          </>
        ) : null}
        {category === "VEHICLE" ? (
          <>
            <rect x="18" y="16" width="76" height="23" />
            <rect x="96" y="24" width="8" height="15" />
          </>
        ) : null}
        {category === "PASSENGER" ? (
          <>
            <rect x="18" y="26" width="82" height="13" />
            <rect x="26" y="18" width="62" height="7" />
            <rect x="34" y="12" width="40" height="5" />
          </>
        ) : null}
        {category === "TUG" ? (
          <>
            <rect x="34" y="28" width="34" height="11" />
            <rect x="44" y="19" width="16" height="8" />
            <rect x="70" y="24" width="6" height="15" />
          </>
        ) : null}
        {category === "OFFSHORE" ? (
          <>
            <rect x="18" y="30" width="46" height="9" />
            <rect x="20" y="18" width="24" height="11" />
            <rect x="66" y="34" width="38" height="5" />
          </>
        ) : null}
        {category === "FISHING" ? (
          <>
            <rect x="34" y="30" width="30" height="9" />
            <rect x="42" y="22" width="14" height="7" />
            <rect x="66" y="14" width="3" height="25" />
          </>
        ) : null}
        {category === "UNKNOWN" ? (
          <>
            <rect x="34" y="30" width="44" height="9" />
            <rect x="52" y="22" width="14" height="7" />
          </>
        ) : null}
      </g>
    </svg>
  );
}

export function VesselImageHeader({
  identity,
  imagery,
  className,
}: {
  readonly identity: VesselIdentity;
  /** Normalised at the provider boundary; absent for sources with no imagery. */
  readonly imagery?: VesselImagerySource;
  readonly className?: string;
}) {
  const resolved: VesselImage = useMemo(
    () => resolveVesselImage(identity, imagery, failedUrls),
    [identity, imagery],
  );

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  /*
   * The vessel this component is currently about.
   *
   * A load that resolves after the officer has moved on belongs to a
   * vessel nobody is looking at; without this check it would land under
   * the new vessel's name.
   */
  const currentImo = useRef(identity.imo);
  useEffect(() => {
    currentImo.current = identity.imo;
    setLoaded(false);
    setFailed(false);
  }, [identity.imo]);

  const onLoad = useCallback(() => {
    if (currentImo.current !== identity.imo) return;
    setLoaded(true);
  }, [identity.imo]);

  const onError = useCallback(() => {
    if (resolved.url) failedUrls.add(resolved.url);
    if (currentImo.current !== identity.imo) return;
    // Falls through to the class figure on the next render, because the
    // resolver consults the same failed-URL set.
    setFailed(true);
  }, [identity.imo, resolved.url]);

  const showPhotograph = Boolean(resolved.url) && !failed;
  const kind = showPhotograph ? resolved.kind : failed ? "DEFAULT_TYPE" : resolved.kind;
  const badge = IMAGE_KIND_BADGE[kind];

  return (
    <>
      <figure
        data-testid="vessel-image-header"
        data-image-kind={kind}
        className={cn(
          // Fixed ratio, reserved before anything loads, so the identity
          // fields below never jump when a picture arrives.
          "relative aspect-[16/9] w-full shrink-0 overflow-hidden border-b border-border bg-muted/40",
          className,
        )}
      >
        {showPhotograph ? (
          <>
            {!loaded ? (
              <div
                data-testid="vessel-image-skeleton"
                className="absolute inset-0 animate-pulse bg-muted"
                aria-hidden
              />
            ) : null}
            <img
              src={resolved.url}
              alt={resolved.alt}
              loading="lazy"
              decoding="async"
              onLoad={onLoad}
              onError={onError}
              className={cn(
                "h-full w-full object-cover transition-opacity duration-200",
                loaded ? "opacity-100" : "opacity-0",
              )}
            />
          </>
        ) : (
          <div
            data-testid="vessel-image-figure"
            role="img"
            aria-label={resolved.alt}
            className="flex h-full w-full items-center justify-center px-8 py-6"
          >
            <VesselFigure category={resolved.category} />
          </div>
        )}

        {/* What the picture is allowed to claim. */}
        <span
          data-testid="vessel-image-badge"
          className={cn(
            "absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] backdrop-blur-sm",
            depictsThisVessel(kind)
              ? "bg-[color:var(--color-teal)]/15 text-[color:var(--color-teal)]"
              : "bg-background/80 text-muted-foreground",
          )}
        >
          {badge}
        </span>

        {/* Identity over the picture, so the two are read together. */}
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent px-3 pb-1.5 pt-6">
          <span className="block truncate text-[12.5px] font-semibold text-foreground">
            {identity.name}
          </span>
          <span className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {identity.type ?? categoryPhrase(resolved.category)}
          </span>
        </figcaption>

        <button
          type="button"
          data-testid="vessel-image-expand"
          aria-label={`Enlarge image for ${identity.name}`}
          onClick={() => setExpanded(true)}
          className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
        >
          <span className="rounded bg-background/85 p-1 backdrop-blur-sm">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
      </figure>

      {expanded ? (
        <ExpandedImage
          identity={identity}
          resolved={resolved}
          kind={kind}
          showPhotograph={showPhotograph}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The larger view.
 *
 * An overlay rather than a route: the officer is still looking at a
 * selected vessel on a live map, and navigating away to see a picture
 * would cost them the selection and remount the canvas.
 */
function ExpandedImage({
  identity,
  resolved,
  kind,
  showPhotograph,
  onClose,
}: {
  readonly identity: VesselIdentity;
  readonly resolved: VesselImage;
  readonly kind: VesselImage["kind"];
  readonly showPhotograph: boolean;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-testid="vessel-image-expanded"
      role="dialog"
      aria-modal="true"
      aria-label={`Image for ${identity.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
      >
        <div className="relative aspect-[16/9] w-full bg-muted/40">
          {showPhotograph ? (
            <img src={resolved.url} alt={resolved.alt} className="h-full w-full object-contain" />
          ) : (
            <div
              role="img"
              aria-label={resolved.alt}
              className="flex h-full w-full items-center justify-center px-16 py-10"
            >
              <VesselFigure category={resolved.category} />
            </div>
          )}
        </div>
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{identity.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {/* An MMSI standing in as the key is not an IMO. */}
              {hasReportedImo(identity) ? `IMO ${identity.imo}` : `MMSI ${identity.mmsi ?? "—"}`}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{IMAGE_KIND_DETAIL[kind]}</p>
            {resolved.attribution ? (
              <p className="mt-0.5 text-[10px] text-muted-foreground">{resolved.attribution}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close image"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
