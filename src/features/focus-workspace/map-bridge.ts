/**
 * Map selection → focus subject.
 *
 * The map already has a typed selection inside the Shared Geospatial
 * Service, and it earns it: `MapSelection` drives the camera, the
 * feature-state highlight and the URL. This does not replace it, mirror
 * it into a second store, or write back to it. It translates, in one
 * direction, so that clicking a vessel on the map and opening the same
 * vessel from a panel converge on one focus subject.
 *
 * ## Why the translation is partial
 *
 * `MapSelectionKind` has fourteen members; focus has nine, and they are
 * not a subset of each other. A berth, an anchorage, a zone, a geofence,
 * a SAR detection, an AIS gap and an infrastructure asset are all
 * selectable on the map and none is a subject the rest of the
 * application can open a case on, correlate, or answer questions about.
 *
 * Those return null. The alternative — mapping a berth to its port, or a
 * SAR detection to "incident" — would put a subject in focus that the
 * officer did not choose, and every downstream surface would then confidently
 * describe the wrong object.
 *
 * ## Titles are identifiers, never names
 *
 * A selection carries ids, not names: the map knows a vessel's IMO
 * because that is what the feature was keyed by, and does not know it is
 * called MV Ocean Melody. So the title is the strongest real identifier
 * available and the descriptor is the existing `describeSelection`
 * formatter. Inventing a display name here would be fabricating the one
 * field an officer is most likely to trust on sight.
 */
import { useEffect } from "react";

import { describeSelection, type MapSelection } from "@/services/geospatial/selection";
import { sgs, type SharedGeospatialService } from "@/services/geospatial";
import { useFocusSubjectStore, type FocusSubject } from "@/stores/focus-subject.store";

/**
 * Translate a map selection into a focus subject.
 *
 * Returns null for selections that name no focusable subject — which is
 * a supported outcome, not a failure.
 */
export function focusSubjectFromMapSelection(selection: MapSelection | null): FocusSubject | null {
  if (!selection) return null;

  const descriptor = describeSelection(selection);

  switch (selection.kind) {
    case "vessel":
      return {
        kind: "vessel",
        // IMO when the source published one; GFW does not, and the id is
        // then the only identifier that exists.
        id: selection.id,
        title: selection.imo ?? selection.id,
        descriptor,
      };
    case "voyage":
      return {
        kind: "voyage",
        id: selection.id,
        title: selection.voyageNumber ?? selection.id,
        descriptor,
      };
    case "port":
      return { kind: "port", id: selection.id, title: selection.id, descriptor };
    case "incident":
      return { kind: "incident", id: selection.id, title: selection.id, descriptor };
    case "investigation":
      return { kind: "investigation", id: selection.id, title: selection.id, descriptor };
    case "risk-event":
      return { kind: "risk-event", id: selection.id, title: selection.id, descriptor };
    // terminal · berth · anchorage · zone · sar-detection · ais-gap ·
    // infrastructure · geofence — selectable, but not focusable subjects.
    default:
      return null;
  }
}

/**
 * Open the Focus Workspace when the officer selects on the map.
 *
 * Mounted by Mission Control alongside the map. Subscribes to the
 * service the map already writes to, so no map interaction changes and
 * the officer's layer state is never touched.
 *
 * A selection that translates to nothing leaves focus exactly as it was:
 * clicking a geofence is not a reason to discard the vessel the officer
 * was working on.
 */
export function useMapFocusBridge(service: SharedGeospatialService = sgs): void {
  const openWorkspace = useFocusSubjectStore((s) => s.openWorkspace);

  useEffect(() => {
    let previousKey: string | null = null;

    const handle = (selection: MapSelection | null) => {
      // Guard against re-opening on every unrelated state notification.
      // SGS notifies on camera moves too, and re-running this would keep
      // re-opening a drawer the officer had dismissed.
      const key = selection ? `${selection.kind}:${selection.id}` : null;
      if (key === previousKey) return;
      previousKey = key;

      const subject = focusSubjectFromMapSelection(selection);
      if (subject) openWorkspace(subject);
    };

    handle(service.get().selection);
    return service.subscribe((state) => handle(state.selection));
  }, [service, openWorkspace]);
}
