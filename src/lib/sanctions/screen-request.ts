/**
 * A one-shot request to screen a vessel, from the Copilot to the drawer.
 *
 * The Copilot must not screen directly — that would be a second path to
 * the screening service, reachable from text nobody reviewed. Instead it
 * selects the vessel and raises a request here; the drawer's screening
 * panel, which already owns the canonical call, picks it up.
 *
 * Requests are addressed by IMO and consumed once, so a request for one
 * hull cannot trigger a screen on whichever vessel is opened next.
 */
type Listener = (imo: string) => void;

const listeners = new Set<Listener>();
let pending: string | null = null;

export function requestVesselScreening(imo: string): void {
  pending = imo;
  for (const listener of listeners) listener(imo);
}

export function onScreeningRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Take the pending request if it is for this hull. Consumes it. */
export function consumeScreeningRequest(imo: string | null | undefined): boolean {
  if (!imo || pending !== imo) return false;
  pending = null;
  return true;
}

/** Test seam: drop any pending request. */
export function resetScreeningRequests(): void {
  pending = null;
  listeners.clear();
}
