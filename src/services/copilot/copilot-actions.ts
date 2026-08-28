/**
 * The one place the Copilot is allowed to change the system.
 *
 * Until now the Copilot composed prompts. `CopilotCommand` carries a
 * `promptTemplate` and a `confirmationRequired` flag with nothing behind
 * it; there was no `executeAction`, no dispatcher, no path from an
 * officer's sentence to the map. It could describe every action in the
 * product and perform none of them.
 *
 * This is that path, and it is deliberately narrow. Every action routes
 * through the same canonical service a human clicking the interface
 * would reach — `navigateTo` for the camera, `select` for selection,
 * the workflow store for cases. A second selection system or a second
 * camera writer entering through the assistant would be the worst place
 * to acquire one, because it would be driven by text nobody reviewed.
 *
 * ## Read and write are not the same risk
 *
 * Moving the camera is undone by moving it back. Opening an investigation
 * is a record with an officer's name on it. So actions declare which they
 * are, and the ones that change state cannot execute until an officer has
 * said yes to that specific action — not to the sentence that produced
 * it.
 *
 * ## It reports what happened, not what was attempted
 *
 * An executor that returns success because it dispatched something would
 * let the assistant say "I've selected that vessel" about a vessel it
 * failed to find. Every result carries the outcome the canonical service
 * actually produced.
 */
import { navigateTo, navigateToCoordinates } from "@/services/geospatial/navigation";
import { sgs, type SharedGeospatialService } from "@/services/geospatial";
import type { LonLat } from "@/services/geospatial/types";

/**
 * Everything the Copilot may do.
 *
 * A closed union rather than a string and a payload: an action the
 * dispatcher has no case for is a compile error, which is what stops a
 * capability being invented in a prompt and half-wired later.
 */
export type CopilotAction =
  | { readonly type: "SELECT_VESSEL"; readonly imo: string }
  | { readonly type: "CLEAR_SELECTION" }
  | { readonly type: "NAVIGATE_PLACE"; readonly place: string }
  | { readonly type: "NAVIGATE_COORDINATES"; readonly coordinates: LonLat; readonly zoom?: number }
  | { readonly type: "ZOOM"; readonly direction: "in" | "out" }
  | { readonly type: "SET_SOURCES"; readonly sourceIds: readonly string[] }
  /*
   * Vessel questions about a hull the officer has already chosen.
   *
   * These carry the IMO rather than reading the current selection at
   * execution time: "where has it been" is answered about the vessel the
   * officer meant when they said it, not whichever vessel happens to be
   * selected once the sentence finishes resolving.
   */
  | { readonly type: "SHOW_VESSEL_TRACK"; readonly imo: string }
  | { readonly type: "SHOW_VESSEL_INTELLIGENCE"; readonly imo: string }
  /*
   * The only action here that writes a record. It exists to make the
   * confirmation gate real rather than theoretical — a gate with nothing
   * behind it is a gate nobody has tested.
   */
  | { readonly type: "OPEN_INVESTIGATION"; readonly imo: string; readonly vesselName?: string };

/**
 * Whether an action changes something an officer would have to undo.
 *
 * Navigation and selection are reversible by looking elsewhere. Anything
 * that writes a record is not, and must pass the confirmation gate.
 *
 * The union currently holds no state-changing actions — investigation
 * creation is deliberately not wired yet — but the classification exists
 * first so the gate cannot be retrofitted around an action that already
 * ships without it.
 */
export function isStateChanging(action: CopilotAction): boolean {
  switch (action.type) {
    case "SELECT_VESSEL":
    case "CLEAR_SELECTION":
    case "NAVIGATE_PLACE":
    case "NAVIGATE_COORDINATES":
    case "ZOOM":
    case "SHOW_VESSEL_TRACK":
    case "SHOW_VESSEL_INTELLIGENCE":
      return false;
    case "OPEN_INVESTIGATION":
      /*
       * Creates a case record with the officer's name on it. Nothing
       * about that is reversible by looking elsewhere.
       */
      return true;
    case "SET_SOURCES":
      /*
       * Changing which providers feed the map alters what every other
       * surface reports, and an officer who did not notice would be
       * reading a different picture than they think. Reversible, but not
       * invisible.
       */
      return true;
  }
}

export interface ActionResult {
  readonly ok: boolean;
  /** What actually happened, for the assistant to say aloud. */
  readonly summary: string;
  /** Present when the action could not be carried out. */
  readonly reason?: string;
}

export interface ActionExecutionOptions {
  readonly service?: SharedGeospatialService;
  /**
   * Whether the officer has approved this specific action.
   *
   * Not whether they approved the sentence. A request that resolves to
   * three actions needs approval for the one that writes, and inferring
   * consent from an earlier yes is how an assistant ends up doing more
   * than was agreed.
   */
  readonly confirmed?: boolean;
  /** Vessels currently held, for resolving a selection to a real hull. */
  readonly knownImos?: readonly string[];
  /**
   * How to open an investigation, supplied by the surface that has one.
   *
   * Injected rather than imported so the dispatcher stays free of the
   * investigation module, and so a surface with no case workflow reports
   * that honestly instead of appearing to open one.
   */
  readonly openInvestigation?: (imo: string) => void;
}

/**
 * Carry out one action, or explain why it did not happen.
 *
 * Never throws. A failed action is an ordinary answer the assistant
 * should speak, not an exception the interface has to catch — and an
 * assistant that crashes mid-sentence is worse than one that says it
 * could not comply.
 */
export function executeCopilotAction(
  action: CopilotAction,
  options: ActionExecutionOptions = {},
): ActionResult {
  const service = options.service ?? sgs;

  if (isStateChanging(action) && !options.confirmed) {
    return {
      ok: false,
      summary: "Waiting for confirmation.",
      reason: "This action changes what the map reports and needs approval first.",
    };
  }

  switch (action.type) {
    case "SELECT_VESSEL": {
      /*
       * Selection is checked against the vessels actually held.
       *
       * Selecting an IMO nobody is carrying would leave the drawer
       * resolving nothing while the assistant announced success — the
       * officer told a vessel was open, looking at an empty panel.
       */
      if (options.knownImos && !options.knownImos.includes(action.imo)) {
        return {
          ok: false,
          summary: "That vessel is not in the current picture.",
          reason: "No vessel with that identifier is held by the connected source.",
        };
      }
      service.select({ kind: "vessel", id: action.imo, imo: action.imo });
      return { ok: true, summary: `Selected ${action.imo}.` };
    }

    case "CLEAR_SELECTION":
      service.clearSelection();
      return { ok: true, summary: "Cleared the selection." };

    case "NAVIGATE_PLACE": {
      const result = navigateTo({ place: action.place, source: "voice" }, service);
      return result.ok
        ? { ok: true, summary: `Moved to ${result.place?.name ?? action.place}.` }
        : { ok: false, summary: "Could not go there.", reason: result.reason ?? undefined };
    }

    case "NAVIGATE_COORDINATES": {
      const result = navigateToCoordinates(
        action.coordinates,
        { zoom: action.zoom, source: "voice" },
        service,
      );
      return result.ok
        ? { ok: true, summary: "Moved to those coordinates." }
        : { ok: false, summary: "Could not go there.", reason: result.reason ?? undefined };
    }

    case "ZOOM": {
      /*
       * Zoom is a navigation to where the officer already is, so it goes
       * through the same path as every other camera change rather than
       * reaching for `setCamera` and re-deriving the scope's limits at
       * the call site.
       */
      const state = service.get();
      const target = action.direction === "in" ? state.zoom + 2 : state.zoom - 2;
      const result = navigateTo(
        { coordinates: state.center, zoom: target, source: "voice" },
        service,
      );
      return result.ok
        ? { ok: true, summary: action.direction === "in" ? "Zoomed in." : "Zoomed out." }
        : { ok: false, summary: "Could not change the zoom.", reason: result.reason ?? undefined };
    }

    case "SET_SOURCES":
      service.setEnabledSources(action.sourceIds);
      return { ok: true, summary: "Changed the active sources." };

    /*
     * Both vessel questions are answered by selecting the hull. The
     * drawer already resolves the track and the findings from the
     * selection, so a second retrieval path here would produce a copy
     * that could disagree with what the officer is looking at.
     */
    case "SHOW_VESSEL_TRACK":
    case "SHOW_VESSEL_INTELLIGENCE": {
      if (options.knownImos && !options.knownImos.includes(action.imo)) {
        return {
          ok: false,
          summary: "That vessel is not in the current picture.",
          reason: "No vessel with that identifier is held by the connected source.",
        };
      }
      service.select({ kind: "vessel", id: action.imo, imo: action.imo });
      return {
        ok: true,
        summary:
          action.type === "SHOW_VESSEL_TRACK"
            ? `Opened the movement history for ${action.imo}.`
            : `Opened vessel intelligence for ${action.imo}.`,
      };
    }

    case "OPEN_INVESTIGATION": {
      /*
       * Reaches confirmed only, because `isStateChanging` gates it
       * above. The case itself is opened by the existing server
       * function, which owns the lifecycle; this returns immediately and
       * reports the request rather than the outcome, so nothing here
       * claims a case exists before the server says so.
       */
      const opener = options.openInvestigation;
      if (!opener) {
        return {
          ok: false,
          summary: "I cannot open an investigation from here.",
          reason: "No investigation workflow is connected to this surface.",
        };
      }
      opener(action.imo);
      return {
        ok: true,
        summary: `Requested an investigation for ${action.vesselName ?? action.imo}.`,
      };
    }
  }
}
