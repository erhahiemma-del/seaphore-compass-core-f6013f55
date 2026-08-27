/**
 * What a vessel looks like, and how much that picture is worth.
 *
 * An officer who has just selected a ship wants to know what kind of ship
 * it is before they read a single field. A picture answers that faster
 * than any table. It also introduces the most persuasive way this
 * application could mislead: a photograph looks like evidence, and a
 * photograph of *some* tanker sitting above the name of *this* tanker
 * reads as a photograph of this one.
 *
 * That is the failure this module is built around. A stock illustration
 * and a source-supplied photograph must never be shown the same way,
 * because their claims are different — one says "this is what a tanker
 * looks like" and the other says "this is that ship".
 *
 * ## Kinds, strongest claim first
 *
 * The resolution order below is not a fallback chain for convenience. It
 * is an ordering by how much the picture is entitled to assert, and every
 * step down is announced to the officer rather than hidden.
 *
 * ## Not the position provenance model
 *
 * `PositionKind` grades how a coordinate was arrived at. This grades what
 * an image depicts. They are separate axes — a vessel can have an
 * OBSERVED position and no photograph at all — and sharing one enum
 * would make both vaguer.
 */
import type { VesselIdentity } from "./vessel";
import { classifyVessel, type VesselVisualCategory } from "./vessel-visual";

/**
 * How much an image is entitled to claim.
 *
 * Ordered strongest first, which is also resolution order.
 */
export type VesselImageKind =
  /** A picture of this hull, captured and dated. */
  | "OBSERVED"
  /** A provider supplied it for this vessel, without capture provenance. */
  | "PROVIDER"
  /** A reference illustration for the class. Not this ship. */
  | "DEFAULT_TYPE"
  /** No class either. A neutral vessel figure standing in for nothing. */
  | "GENERIC_FALLBACK";

export interface VesselImage {
  /** Absent for the built-in references, which are drawn rather than fetched. */
  readonly url?: string;
  readonly thumbnailUrl?: string;
  readonly source?: string;
  readonly capturedAt?: string;
  readonly attribution?: string;
  readonly kind: VesselImageKind;
  /**
   * The class figure to draw when there is no photograph.
   *
   * Carried on the result so the component never re-derives the category
   * and never disagrees with the resolver about which silhouette belongs
   * to the vessel.
   */
  readonly category: VesselVisualCategory;
  /** Non-empty always. Screen readers get the same honesty as everyone else. */
  readonly alt: string;
}

/**
 * The badge an officer reads in the corner of the picture.
 *
 * Deliberately not "LIVE IMAGE" for anything but a dated capture. A
 * reference illustration labelled live would be the single most
 * misleading string in the application.
 */
export const IMAGE_KIND_BADGE: Readonly<Record<VesselImageKind, string>> = {
  OBSERVED: "Live image",
  PROVIDER: "Provider image",
  DEFAULT_TYPE: "Type reference",
  GENERIC_FALLBACK: "Image unavailable",
};

/** The longer sentence, for the expanded view. */
export const IMAGE_KIND_DETAIL: Readonly<Record<VesselImageKind, string>> = {
  OBSERVED: "A dated photograph of this vessel.",
  PROVIDER: "Supplied for this vessel by a connected source. Capture date unknown.",
  DEFAULT_TYPE: "A reference illustration for this class of vessel. Not a photograph of this ship.",
  GENERIC_FALLBACK:
    "No image is available and the vessel class is unknown. This figure depicts no particular vessel.",
};

/**
 * Whether the picture depicts the selected vessel.
 *
 * The question a caption, an export or an investigation must ask before
 * treating an image as being about this ship.
 */
export function depictsThisVessel(kind: VesselImageKind): boolean {
  return kind === "OBSERVED" || kind === "PROVIDER";
}

/**
 * Normalised image fields a provider may carry.
 *
 * Providers disagree about what to call this — `image`, `imageUrl`,
 * `photo`, `photoUrl`, `vesselImage`, `thumbnail`. Reading all of them
 * here means no UI component ever learns any provider's field names,
 * which is the same rule the source descriptor model already enforces
 * for everything else.
 */
export interface VesselImagerySource {
  readonly image?: string;
  readonly imageUrl?: string;
  readonly photo?: string;
  readonly photoUrl?: string;
  readonly vesselImage?: string;
  readonly thumbnail?: string;
  readonly imageSource?: string;
  readonly imageCapturedAt?: string;
  readonly imageAttribution?: string;
}

/** First usable URL among the aliases, or null. */
function firstUrl(supplied: VesselImagerySource | undefined): string | null {
  if (!supplied) return null;
  const candidates = [
    supplied.image,
    supplied.imageUrl,
    supplied.photo,
    supplied.photoUrl,
    supplied.vesselImage,
    supplied.thumbnail,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && isSafeImageUrl(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether a URL is one the panel is willing to load.
 *
 * `http(s)` and `data:` images only. A provider string is untrusted
 * input, and `javascript:` in an image position is a script execution
 * primitive rather than a broken picture.
 */
export function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === "") return false;
  return /^https:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed);
}

/** Human phrase for a class, used in alt text. */
const CATEGORY_PHRASE: Readonly<Record<VesselVisualCategory, string>> = {
  CONTAINER: "container ship",
  TANKER: "tanker",
  BULK: "bulk carrier",
  VEHICLE: "vehicle carrier",
  PASSENGER: "passenger ship",
  FISHING: "fishing vessel",
  TUG: "tug",
  OFFSHORE: "offshore support vessel",
  UNKNOWN: "vessel",
};

export function categoryPhrase(category: VesselVisualCategory): string {
  return CATEGORY_PHRASE[category];
}

/**
 * Decide what picture to show, and what it is allowed to claim.
 *
 * One resolver, so the ordering exists in exactly one place. A component
 * that made its own choice between a photograph and an illustration would
 * eventually make a different one, and the difference would be invisible
 * until a reference picture appeared under a "live image" badge.
 *
 * `failedUrls` lets the caller retire URLs that have already failed this
 * session, so a broken link degrades once instead of retrying on every
 * reselection.
 */
export function resolveVesselImage(
  identity: VesselIdentity,
  supplied?: VesselImagerySource,
  failedUrls?: ReadonlySet<string>,
): VesselImage {
  const visual = classifyVessel(identity.type);
  const category = visual.category;

  const url = firstUrl(supplied);
  const usable = url && !failedUrls?.has(url) ? url : null;

  if (usable) {
    /*
     * A capture date is what separates a photograph of this hull from a
     * picture a provider merely filed against it. Without one the image
     * may be years old or may be the sister ship, so it does not get to
     * claim to be live.
     */
    const captured = supplied?.imageCapturedAt;
    return {
      url: usable,
      thumbnailUrl: supplied?.thumbnail,
      source: supplied?.imageSource,
      capturedAt: captured,
      attribution: supplied?.imageAttribution,
      kind: captured ? "OBSERVED" : "PROVIDER",
      category,
      alt: `${identity.name}, ${categoryPhrase(category)}`,
    };
  }

  if (category !== "UNKNOWN" && visual.typeReported) {
    return {
      kind: "DEFAULT_TYPE",
      category,
      // Says what it is in the alt text too: a screen reader user must
      // not be told this is a photograph of the ship.
      alt: `Representative ${categoryPhrase(category)} illustration. Not a photograph of ${identity.name}.`,
    };
  }

  return {
    kind: "GENERIC_FALLBACK",
    category: "UNKNOWN",
    alt: `No image available for ${identity.name}. Vessel class unknown.`,
  };
}
