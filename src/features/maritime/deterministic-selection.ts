/**
 * Selecting a known vessel without chasing it with the mouse.
 *
 * Simulated vessels move. Verifying anything about a *selected* vessel
 * meant reading its coordinates, computing where it fell on screen, and
 * clicking there — and the vessel had moved by the time the click
 * landed. That failed four times across two sessions and blocked three
 * verification gates: whether the drawer pushes the selected vessel out
 * of view, whether selected emphasis is visible, and whether the voyages
 * notice covers the vessel at depth.
 *
 * So the officer's click is not the only way in. `?select=<identifier>`
 * names a vessel directly.
 *
 * ## It is an entrance, not a second selection system
 *
 * The parameter resolves an identifier and then calls the same
 * `service.select` a map click calls. Everything downstream — the
 * drawer, the emphasis, the track — cannot tell the two apart, which is
 * the only reason a gate closed this way is worth anything. A parallel
 * selection path would prove something about itself rather than about
 * the product.
 *
 * ## It fires once
 *
 * A latch, not a subscription. Re-applying the parameter would fight an
 * officer who selected something else, and an effect that re-selects on
 * every vessel update is a camera loop with a different name. The URL is
 * read for an initial selection and never written back: full URL-state
 * synchronisation is a larger product decision and is not needed here.
 *
 * ## It is harmless in production
 *
 * No business logic depends on it, no vessel identifier is hardcoded,
 * and an unresolvable value changes nothing — an unknown vessel leaves
 * selection exactly as it was rather than clearing it.
 */

/** The identifier requested by the URL, if any. */
export function selectionParamFrom(search: string): string | null {
  if (!search) return null;
  const requested = new URLSearchParams(search).get("select");
  const trimmed = requested?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The requested identifier, captured once at module load.
 *
 * The shared map service serialises its own state into the URL and drops
 * parameters it does not own, so `select` is erased within the first few
 * frames — measured: the address bar had already lost it before the
 * vessel feed arrived, and a component reading `window.location` at that
 * point found nothing.
 *
 * Reading it at import time is the only place it is reliably still
 * there. Frozen at that moment on purpose: this is an opening
 * instruction, not a piece of live state, and re-reading a URL the map
 * rewrites continuously is how an effect starts fighting the officer.
 */
export const REQUESTED_SELECTION: string | null =
  typeof window === "undefined" ? null : selectionParamFrom(window.location.search);

/**
 * Resolve a requested identifier against the vessels actually held.
 *
 * Matches IMO, MMSI or name, case-insensitively, because a person typing
 * a verification URL should not have to remember which identifier the
 * source happens to key on.
 *
 * Returns null rather than a guess when nothing matches. Selecting a
 * vessel nobody is carrying would leave the drawer resolving nothing
 * while the map looked selected — the failure this exists to avoid, not
 * one to introduce by a different route.
 */
export function resolveRequestedVessel(
  requested: string | null,
  vessels: readonly {
    readonly identity: { readonly imo: string; readonly mmsi?: string; readonly name: string };
  }[],
): string | null {
  if (!requested) return null;
  const wanted = requested.toLowerCase();
  const match = vessels.find(
    (vessel) =>
      vessel.identity.imo.toLowerCase() === wanted ||
      vessel.identity.mmsi?.toLowerCase() === wanted ||
      vessel.identity.name.toLowerCase() === wanted,
  );
  return match ? match.identity.imo : null;
}
