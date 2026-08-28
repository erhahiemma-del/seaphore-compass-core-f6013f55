import { isDescribable, type VesselSource } from "@/services/geospatial";

/**
 * A provider's own account of why it returned nothing.
 *
 * `null` for `ok`, and for `empty` — a source that genuinely reported no
 * vessels in the box is not a failure and must not be dressed as one.
 * Everything else is a gap in collection, phrased so an officer can tell
 * which one it is and who can fix it.
 */
export function feedErrorFromSource(source: VesselSource): string | null {
  if (!isDescribable(source)) return null;
  const { status, message } = source.report();
  const detail = message ? ` ${message}` : "";
  switch (status) {
    case "ok":
    case "empty":
    case "not-queried":
      return null;
    case "credentials-missing":
      return `${source.id} has no credential configured, so it was not queried.${detail}`;
    case "auth-failed":
      return `${source.id} rejected Seaphore's credential.${detail}`;
    case "subscription-inactive":
      return `${source.id} accepted the credential but the current plan does not return this data.${detail}`;
    case "upstream-error":
      return `${source.id} could not be reached.${detail}`;
    default:
      return `${source.id} returned an unusable response.${detail}`;
  }
}
