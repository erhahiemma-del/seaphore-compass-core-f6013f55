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
import { MAP_SCOPES } from "@/services/geospatial/constants";
import {
  assessFleetApproach,
  describeFleetApproach,
  type FleetApproachResult,
} from "@/services/geospatial/fleet-approach";
import type { Vessel } from "@/services/geospatial";
import { navigateTo, navigateToCoordinates } from "@/services/geospatial/navigation";
import { sgs, type SharedGeospatialService } from "@/services/geospatial";
import { findNigerianPort } from "@/services/geospatial/nigerian-ports";
import type { LonLat } from "@/services/geospatial/types";
import { earthPreset, EARTH_CAMERA_PRESETS } from "@/services/geospatial/earth-presets";
import { layerRegistry } from "@/services/geospatial/layer-registry";
import type { MapFilters } from "@/services/geospatial/vessel-filter";

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
  /*
   * Open a port workspace.
   *
   * Carries a UN/LOCODE rather than a name: port names are not unique —
   * "LAGOS" is a port in Nigeria and a port in Portugal — so a name would
   * let a search box or a spoken sentence open the wrong country's port.
   */
  | { readonly type: "SELECT_PORT"; readonly unlocode: string }
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
  | { readonly type: "OPEN_INVESTIGATION"; readonly imo: string; readonly vesselName?: string }
  /*
   * Which vessels are heading for the boundary, within a horizon the
   * officer named. Read-only: it assesses and reports, and changes
   * nothing about the map or the fleet.
   */
  | { readonly type: "SHOW_APPROACHING_VESSELS"; readonly thresholdHours: number }
  /*
   * Sanctions screening, through the one canonical screening service.
   *
   * Running a screen writes an evidentiary record and consumes provider
   * quota, so it is state-changing. Reading what a previous screen found
   * is not — it opens the drawer panel that already holds the history.
   */
  | { readonly type: "SCREEN_VESSEL"; readonly imo: string; readonly vesselName?: string }
  | { readonly type: "SHOW_SANCTIONS_RESULT"; readonly imo: string }
  /*
   * Layer visibility, named against the layer registry rather than
   * parsed freely. A layer id the registry does not hold is refused, so
   * a sentence cannot invent a dataset and then have the assistant
   * report it was turned on.
   */
  | { readonly type: "SHOW_LAYER"; readonly layerId: string }
  | { readonly type: "HIDE_LAYER"; readonly layerId: string }
  /*
   * A camera preset from the Intelligence Earth registry — Global,
   * Africa, Nigeria, and each Nigerian port twin. Distinct from
   * NAVIGATE_PLACE, which resolves a free-text place name: a preset
   * carries the framing (zoom, pitch, bearing) an officer expects at
   * that scope.
   */
  | { readonly type: "FLY_TO"; readonly presetId: string }
  /*
   * Narrow which vessels qualify. Only dimensions `MapFilters` actually
   * carries, validated below — a filter the model does not hold would
   * silently match everything and report a narrowing that never
   * happened.
   */
  | { readonly type: "FILTER_VESSELS"; readonly patch: Partial<MapFilters> }
  /*
   * Replay of movement already recorded. The timeline is owned by the
   * map surface, so both actions reach it through an injected control
   * rather than a second recorder.
   */
  | { readonly type: "START_REPLAY"; readonly imo?: string; readonly hours?: number }
  | { readonly type: "STOP_REPLAY" }
  /* Open the evidence the existing drawer already holds for a hull. */
  | { readonly type: "SHOW_EVIDENCE"; readonly imo: string }
  /*
   * Side-by-side comparison. No comparison surface exists yet, so this
   * refuses honestly unless one is injected — better than a summary the
   * officer cannot inspect.
   */
  | { readonly type: "COMPARE_ENTITIES"; readonly imos: readonly string[] }
  /* Compile a briefing through the existing report engine. */
  | { readonly type: "GENERATE_BRIEF"; readonly imo?: string; readonly subject?: string };

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
    case "SELECT_PORT":
    case "CLEAR_SELECTION":
    case "NAVIGATE_PLACE":
    case "NAVIGATE_COORDINATES":
    case "ZOOM":
    case "SHOW_VESSEL_TRACK":
    case "SHOW_VESSEL_INTELLIGENCE":
    case "SHOW_APPROACHING_VESSELS":
    case "SHOW_SANCTIONS_RESULT":
    case "SHOW_LAYER":
    case "HIDE_LAYER":
    case "FLY_TO":
    case "FILTER_VESSELS":
    case "START_REPLAY":
    case "STOP_REPLAY":
    case "SHOW_EVIDENCE":
    case "COMPARE_ENTITIES":
      /*
       * All reversible by looking elsewhere: they change what is drawn or
       * framed, never what is recorded.
       */
      return false;
    case "GENERATE_BRIEF":
      /*
       * Compiles a report that carries the officer's name and outlives
       * the session, and consumes model capacity to do it.
       */
      return true;
    case "SCREEN_VESSEL":
      /*
       * Writes a screening record against the officer's name, consumes
       * provider quota, and produces evidence that outlives the session.
       */
      return true;
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
  /**
   * Set when the result *is* the answer rather than a report of doing
   * something.
   *
   * "Taking you to Apapa" is worth saying before the camera moves; an
   * assessment is not. Asked how many vessels are approaching, an
   * officer who hears "assessing the fleet" and nothing further has been
   * told the assistant started work and never finished. When this is
   * set, the caller speaks it instead of the intent.
   */
  readonly answer?: string;
  /**
   * The assessment behind the answer, per vessel.
   *
   * Carried so a surface can render distance, arrival basis and
   * provenance rather than re-deriving them from a sentence. Present
   * only for actions that produce one; a caller must not infer an
   * assessment from an action that never made one.
   */
  readonly approach?: FleetApproachResult;
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
   * The fleet, for assessments that read every vessel.
   *
   * Passed in rather than fetched. The map is what holds live positions,
   * and a second retrieval path would produce an answer that could
   * disagree with what the officer is looking at.
   */
  readonly fleet?: readonly Vessel[];
  /** The displayed boundary to assess against. */
  readonly boundaryRing?: readonly LonLat[];
  /**
   * How to open an investigation, supplied by the surface that has one.
   *
   * Injected rather than imported so the dispatcher stays free of the
   * investigation module, and so a surface with no case workflow reports
   * that honestly instead of appearing to open one.
   */
  readonly openInvestigation?: (imo: string) => void;
  /**
   * How to run a sanctions screen, supplied by the surface that holds the
   * screening panel.
   *
   * Injected for the same reason as `openInvestigation`: the dispatcher
   * must not acquire a second screening path, and a surface without one
   * says so rather than implying a screen was run.
   */
  readonly requestSanctionsScreening?: (imo: string) => void;
  /**
   * The map surface's replay timeline controls.
   *
   * Injected because the timeline is component-scoped — there is one
   * recorder, owned by the map, and a dispatcher that built its own
   * would replay a different history than the officer is watching.
   */
  readonly replay?: {
    readonly start: (request: { readonly imo?: string; readonly hours?: number }) => boolean;
    readonly stop: () => void;
  };
  /** How to compile a briefing, supplied by the surface that has one. */
  readonly generateBrief?: (request: { readonly imo?: string; readonly subject?: string }) => void;
  /** How to open a comparison, supplied by a surface that has one. */
  readonly compareEntities?: (imos: readonly string[]) => void;
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
      /*
       * Choosing one hull ends the fleet answer. Leaving the highlight
       * up would dim the rest of the map around a selection that has
       * nothing to do with the earlier question.
       */
      service.update({ approachHighlight: [] });
      return { ok: true, summary: `Selected ${action.imo}.` };
    }

    case "SELECT_PORT": {
      /*
       * Resolved before selecting, for the same reason SELECT_VESSEL
       * checks its IMO: announcing a port that opens an empty panel is
       * worse than saying it is not held. A valid UN/LOCODE outside this
       * deployment's register is a coverage limit, and says so.
       */
      const port = findNigerianPort(action.unlocode);
      if (!port) {
        return {
          ok: false,
          summary: "That port is not in Seaphore's register.",
          reason: `${action.unlocode} may be a real port, but this deployment holds no record for it.`,
        };
      }
      service.select({ kind: "port", id: port.locode });
      return { ok: true, summary: `Opened ${port.name}.` };
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
      /*
       * Clamped to the current scope's limits, absorbed from the voice
       * layer when `executeIntent` was retired. The bound belongs here:
       * it is a property of the map surface, and leaving it at the call
       * site meant every future caller had to remember to re-derive it —
       * which is exactly how the second dispatcher grew last time.
       */
      const state = service.get();
      const limits = MAP_SCOPES[state.scope];
      const target =
        action.direction === "in"
          ? Math.min(limits.maxZoom, state.zoom + 2)
          : Math.max(limits.minZoom, state.zoom - 2);
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

    case "SHOW_APPROACHING_VESSELS": {
      /*
       * Refuses rather than guesses. Without a fleet or a boundary there
       * is no assessment to make, and answering "none approaching" would
       * be indistinguishable from a real all-clear.
       */
      const fleet = options.fleet;
      const ring = options.boundaryRing;
      if (!fleet || fleet.length === 0) {
        return {
          ok: false,
          summary: "I cannot assess approach right now.",
          reason: "No vessels are loaded from the connected source.",
        };
      }
      if (!ring || ring.length < 3) {
        return {
          ok: false,
          summary: "I cannot assess approach right now.",
          reason: "The maritime boundary outline is not loaded.",
        };
      }

      const result = assessFleetApproach(fleet, ring, {
        thresholdHours: action.thresholdHours,
      });
      const answer = describeFleetApproach(result);

      /*
       * Show the officer the vessels the answer is about.
       *
       * Through shared state, like every other thing the map draws — a
       * renderer call here would be a second way to change the picture.
       * Vessels that could not be assessed are deliberately excluded:
       * highlighting them would present an unanswered question as a
       * result.
       */
      service.update({
        approachHighlight: result.approaching.map((entry) => entry.vessel.identity.imo),
      });

      return { ok: true, summary: answer, answer, approach: result };
    }

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

    case "SHOW_SANCTIONS_RESULT": {
      /*
       * Opening the drawer is the whole answer: the screening panel there
       * reads the persisted history through the canonical service. Fetching
       * it here would be a second read path that could disagree with what
       * the officer sees.
       */
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
        summary: `Opened the sanctions screening record for ${action.imo}.`,
      };
    }

    case "SCREEN_VESSEL": {
      /*
       * Confirmed only, via `isStateChanging`. Reports the request, not a
       * result — the outcome belongs to the screening service, and
       * claiming "no match" here before the provider answered would be
       * the exact failure this sprint exists to prevent.
       */
      const screener = options.requestSanctionsScreening;
      if (!screener) {
        return {
          ok: false,
          summary: "I cannot run a sanctions screen from here.",
          reason: "No screening surface is connected to this view.",
        };
      }
      service.select({ kind: "vessel", id: action.imo, imo: action.imo });
      screener(action.imo);
      return {
        ok: true,
        summary: `Requested a sanctions screen for ${action.vesselName ?? action.imo}. The result and its confidence will appear in the vessel drawer.`,
      };
    }

    case "SHOW_LAYER":
    case "HIDE_LAYER": {
      /*
       * Validated against the one layer registry. Toggling by id without
       * checking would let a sentence name a dataset Seaphore does not
       * hold and receive a confirmation for it.
       */
      const definition = layerRegistry.list().find((layer) => layer.id === action.layerId);
      if (!definition) {
        return {
          ok: false,
          summary: "That layer is not one Seaphore holds.",
          reason: `No layer with the id ${action.layerId} is registered.`,
        };
      }
      const wanted = action.type === "SHOW_LAYER";
      const active = service.get().activeLayers.includes(definition.id);
      if (active !== wanted) service.toggleLayer(definition.id);
      return {
        ok: true,
        summary: wanted
          ? `Showing the ${definition.label} layer.`
          : `Hid the ${definition.label} layer.`,
      };
    }

    case "FLY_TO": {
      const preset = earthPreset(action.presetId);
      if (!preset) {
        return {
          ok: false,
          summary: "I do not have a view by that name.",
          reason: `Available views are ${EARTH_CAMERA_PRESETS.map((p) => p.label).join(", ")}.`,
        };
      }
      /*
       * Tilt and heading travel with the navigation rather than being
       * applied afterwards: the framing is part of the view, and a second
       * camera write here would be a second camera writer.
       */
      const result = navigateToCoordinates(
        preset.center,
        { zoom: preset.zoom, pitch: preset.pitch, bearing: preset.bearing, source: "voice" },
        service,
      );
      return result.ok
        ? { ok: true, summary: `Moved to ${preset.label}.` }
        : { ok: false, summary: "Could not move there.", reason: result.reason ?? undefined };
    }

    case "FILTER_VESSELS": {
      /*
       * Only keys `MapFilters` carries reach the state. An unknown
       * dimension is refused rather than dropped quietly: an officer told
       * the fleet was narrowed by tonnage, looking at an unfiltered map,
       * has been misled about what they are seeing.
       */
      const allowed: readonly (keyof MapFilters)[] = [
        "riskLevel",
        "vesselType",
        "destination",
        "arrivalWindow",
        "flag",
        "identifier",
        "positionAge",
      ];
      const keys = Object.keys(action.patch) as (keyof MapFilters)[];
      const unknown = keys.filter((key) => !allowed.includes(key));
      if (keys.length === 0 || unknown.length > 0) {
        return {
          ok: false,
          summary: "I cannot narrow the fleet that way.",
          reason:
            keys.length === 0
              ? "No filter dimension was named."
              : `Seaphore holds no vessel filter for ${unknown.join(", ")}.`,
        };
      }
      service.setFilters(action.patch);
      return { ok: true, summary: `Narrowed the fleet by ${keys.join(", ")}.` };
    }

    case "START_REPLAY": {
      const replay = options.replay;
      if (!replay) {
        return {
          ok: false,
          summary: "I cannot replay from here.",
          reason: "No replay timeline is connected to this surface.",
        };
      }
      if (action.imo) {
        if (options.knownImos && !options.knownImos.includes(action.imo)) {
          return {
            ok: false,
            summary: "That vessel is not in the current picture.",
            reason: "No vessel with that identifier is held by the connected source.",
          };
        }
        service.select({ kind: "vessel", id: action.imo, imo: action.imo });
      }
      const started = replay.start({ imo: action.imo, hours: action.hours });
      return started
        ? {
            ok: true,
            summary: action.hours
              ? `Replaying the last ${action.hours} hours of recorded movement.`
              : "Replaying the recorded movement.",
          }
        : {
            ok: false,
            summary: "There is nothing recorded to replay yet.",
            reason: "The session has not captured enough movement for a replay.",
          };
    }

    case "STOP_REPLAY": {
      const replay = options.replay;
      if (!replay) {
        return {
          ok: false,
          summary: "I cannot replay from here.",
          reason: "No replay timeline is connected to this surface.",
        };
      }
      replay.stop();
      return { ok: true, summary: "Paused the replay." };
    }

    case "SHOW_EVIDENCE": {
      /*
       * Opening the drawer is the whole action. The evidence there is
       * read by the existing provenance panel through the canonical
       * package; assembling a second copy here could disagree with it.
       */
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
        summary: `Opened the evidence held for ${action.imo}, with its sources and confidence.`,
      };
    }

    case "COMPARE_ENTITIES": {
      const compare = options.compareEntities;
      const imos = action.imos.filter(
        (imo) => !options.knownImos || options.knownImos.includes(imo),
      );
      if (imos.length < 2) {
        return {
          ok: false,
          summary: "I need two vessels the map is holding to compare.",
          reason: "Fewer than two of the named vessels are held by the connected source.",
        };
      }
      if (!compare) {
        return {
          ok: false,
          summary: "Seaphore has no side-by-side comparison surface yet.",
          reason: "Comparison is not available in this deployment, so nothing was opened.",
        };
      }
      compare(imos);
      return { ok: true, summary: `Comparing ${imos.join(" and ")}.` };
    }

    case "GENERATE_BRIEF": {
      /*
       * Confirmed only, via `isStateChanging`. Reports the request, not
       * the report — the briefing engine owns compilation, and claiming
       * findings here would be an answer nobody produced.
       */
      const generate = options.generateBrief;
      if (!generate) {
        return {
          ok: false,
          summary: "I cannot compile a briefing from here.",
          reason: "No briefing surface is connected to this view.",
        };
      }
      if (action.imo) service.select({ kind: "vessel", id: action.imo, imo: action.imo });
      generate({ imo: action.imo, subject: action.subject });
      return {
        ok: true,
        summary: `Compiling a briefing${action.subject ? ` on ${action.subject}` : action.imo ? ` for ${action.imo}` : ""}.`,
      };
    }
  }
}
