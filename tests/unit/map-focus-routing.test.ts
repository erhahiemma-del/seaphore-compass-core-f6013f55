/**
 * M7.2a — map selection → focus subject → environment.
 *
 * The chain the whole map sprint rests on. An officer selects something
 * on the map, that becomes the subject the rest of the application is
 * working on, and from there they can open the environment that owns the
 * work. The map discovers; the environments act.
 *
 * Three failures are possible and each is worse than the last: the
 * selection establishes nothing, so the Copilot and the Context Rail
 * silently disagree with the screen; a selection is coerced into the
 * wrong subject, so every downstream surface confidently describes the
 * wrong object; or a subject is pointed at a plausible-looking
 * neighbouring environment, so the link appears to work and shows
 * something else entirely.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { focusSubjectFromMapSelection } from "@/features/focus-workspace/map-bridge";
import {
  ROUTED_FOCUS_KINDS,
  environmentRoute,
  hasEnvironment,
  ENVIRONMENT_UNAVAILABLE_LABELS,
  type EnvironmentUnavailableReason,
} from "@/features/focus-workspace/environment-routing";
import { focusSubjectFromResult, isFocusable } from "@/features/command/focus-bridge";
import type { MapSelection } from "@/services/geospatial/selection";
import type { FocusSubject, FocusSubjectKind } from "@/stores/focus-subject.store";
import type { CommandResult } from "@/features/command/results";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const subject = (kind: FocusSubjectKind, id = "X-1"): FocusSubject => ({ kind, id, title: id });

/* ═══════ 1. A map selection establishes focus ═══════ */

describe("a map selection becomes a focus subject", () => {
  it("translates the kinds that name a real subject", () => {
    const vessel = focusSubjectFromMapSelection({
      kind: "vessel",
      id: "v-1",
      imo: "9321178",
    } as MapSelection);
    expect(vessel?.kind).toBe("vessel");
    // The strongest real identifier, not an invented display name.
    expect(vessel?.title).toBe("9321178");

    const port = focusSubjectFromMapSelection({ kind: "port", id: "NGAPP" } as MapSelection);
    expect(port?.kind).toBe("port");
  });

  it("falls back to the id when the source published no identifier", () => {
    // GFW publishes no IMO. The id is then the only identifier there is,
    // and inventing a name would fabricate the one field an officer is
    // most likely to trust on sight.
    const vessel = focusSubjectFromMapSelection({
      kind: "vessel",
      id: "gfw-4471",
      imo: null,
    } as MapSelection);
    expect(vessel?.title).toBe("gfw-4471");
  });

  it("refuses to coerce a selection that names no subject", () => {
    /*
     * A terminal, berth, anchorage, zone, geofence, SAR detection, AIS
     * gap and infrastructure asset are all selectable, and none is
     * something a case can be opened on. Mapping a berth to its port, or
     * a SAR detection to "incident", would put a subject in focus that
     * the officer never chose.
     */
    const unfocusable = [
      { kind: "terminal", id: "t-1", portId: "NGAPP" },
      { kind: "berth", id: "b-1", terminalId: "t-1" },
      { kind: "anchorage", id: "a-1", portId: "NGAPP" },
      { kind: "zone", id: "z-1", zoneType: "eez" },
      { kind: "sar-detection", id: "s-1", sceneId: "sc-1" },
      { kind: "ais-gap", id: "g-1", mmsi: "657123456" },
      { kind: "infrastructure", id: "i-1", assetType: "platform" },
      { kind: "geofence", id: "f-1" },
    ] as unknown as MapSelection[];

    for (const selection of unfocusable) {
      const result = focusSubjectFromMapSelection(selection);
      expect(`${selection.kind} => ${result === null ? "null" : result.kind}`).toBe(
        `${selection.kind} => null`,
      );
    }
  });

  it("leaves focus untouched when nothing translates", () => {
    // Clicking a geofence is not a reason to discard the vessel in hand.
    expect(focusSubjectFromMapSelection(null)).toBeNull();
  });
});

/* ═══════ 2. Search and map converge ═══════ */

describe("search and map converge on one subject", () => {
  it("produces the same focus subject for the same entity", () => {
    // A vessel found by typing its IMO and a vessel clicked on the map
    // must be the same thing to everything downstream.
    const fromMap = focusSubjectFromMapSelection({
      kind: "vessel",
      id: "IMO-9321178",
      imo: "9321178",
    } as MapSelection);
    const fromSearch = focusSubjectFromResult({
      kind: "vessel",
      id: "IMO-9321178",
      title: "MV Ocean Melody",
    } as CommandResult);

    expect(fromMap?.kind).toBe(fromSearch?.kind);
    expect(fromMap?.id).toBe(fromSearch?.id);
  });

  it("keeps both bridges partial, and refuses the same kinds", () => {
    // Neither vocabulary is a subset of the other, and neither bridge may
    // invent a mapping the other refuses.
    expect(isFocusable("container")).toBe(false);
    expect(isFocusable("person")).toBe(false);
    expect(
      focusSubjectFromMapSelection({ kind: "geofence", id: "f-1" } as unknown as MapSelection),
    ).toBeNull();
  });

  it("writes to the one focus store and never back to the map", () => {
    const bridge = read("src/features/focus-workspace/map-bridge.ts");
    expect(bridge).toContain("useFocusSubjectStore");
    // A second store, or a write back into MapSelection, would let the
    // two representations drift apart.
    expect(bridge).not.toMatch(/\bcreate\(/);
    expect(bridge).not.toContain("setSelection");
  });
});

/* ═══════ 3. Environment routing ═══════ */

describe("a focused subject routes to the environment that owns the work", () => {
  it("sends each subject to its own environment", () => {
    expect(environmentRoute(subject("vessel"), null).destination).toEqual({
      kind: "vessel-operations",
    });
    expect(environmentRoute(subject("port"), null).destination).toEqual({
      kind: "port-operations",
    });
    expect(environmentRoute(subject("cargo"), null).destination).toEqual({
      kind: "manifests-cargo",
    });
    expect(environmentRoute(subject("manifest"), null).destination).toEqual({
      kind: "manifests-cargo",
    });
    expect(environmentRoute(subject("investigation", "INV-1"), null).destination).toEqual({
      kind: "investigation",
      id: "INV-1",
    });
  });

  it("routes a voyage to Vessel & Voyage Operations, which the model names", () => {
    expect(environmentRoute(subject("voyage"), null).destination).toEqual({
      kind: "vessel-operations",
    });
  });

  it("marks the company destination as interim", () => {
    /*
     * No Company Intelligence environment exists. The canonical profile
     * is an honest place to land, but it is not the environment this
     * subject will own — and an unmarked stand-in hides the gap rather
     * than recording it.
     */
    const route = environmentRoute(subject("company"), "canonical-1");
    expect(route.destination).toEqual({ kind: "entity-profile", id: "canonical-1" });
    expect(route.interim).toBe(true);
  });

  it("reports an unresolved canonical id rather than opening a list", () => {
    // Falling back to an environment index would let an officer believe
    // they were looking at their entity.
    const route = environmentRoute(subject("company"), null);
    expect(route.destination).toBeNull();
    expect(route.reason).toBe("no-canonical-record");
  });

  it("reports the kinds that have no environment", () => {
    for (const kind of ["incident", "risk-event"] as const) {
      const route = environmentRoute(subject(kind), "canonical-1");
      expect(`${kind}: ${route.destination === null ? "none" : "routed"}`).toBe(`${kind}: none`);
      expect(route.reason).toBe("no-environment-yet");
      expect(route.interim).toBe(false);
    }
  });

  it("never leaves a subject without an answer", () => {
    // Every focus kind either has an environment or a stated reason, so a
    // new kind cannot be added without deciding where it goes.
    for (const kind of ROUTED_FOCUS_KINDS) {
      const route = environmentRoute(subject(kind), "canonical-1");
      const answered = route.destination !== null || route.reason !== null;
      expect(`${kind}: ${answered}`).toBe(`${kind}: true`);
    }
  });

  it("gives every unavailable reason officer-facing words", () => {
    for (const reason of Object.keys(
      ENVIRONMENT_UNAVAILABLE_LABELS,
    ) as EnvironmentUnavailableReason[]) {
      expect(ENVIRONMENT_UNAVAILABLE_LABELS[reason].length).toBeGreaterThan(0);
    }
  });

  it("agrees with hasEnvironment", () => {
    expect(hasEnvironment(subject("vessel"), null)).toBe(true);
    expect(hasEnvironment(subject("incident"), "c-1")).toBe(false);
  });

  it("adds no store of its own", () => {
    const routing = read("src/features/focus-workspace/environment-routing.ts");
    expect(routing).not.toMatch(/\bcreate\(/);
    expect(routing).not.toContain("createContext");
  });
});

/* ═══════ 4. Every map surface establishes focus ═══════ */

describe("every map surface establishes focus", () => {
  it("mounts the bridge in Mission Control and in Maritime Command", () => {
    /*
     * Maritime Command wrote only to `MapSelection`, so the same click
     * meant two different things depending on which screen it happened
     * on: focused in Mission Control, focused nowhere on the full map.
     */
    expect(read("src/features/mission-control/MissionControl.tsx")).toContain(
      "useMapFocusBridge()",
    );
    expect(read("src/features/maritime/MaritimeCommand.tsx")).toContain(
      'useMapFocusBridge(undefined, "focus-only")',
    );
  });

  it("does not open a drawer over a map-dominant surface", () => {
    // `focus-only` establishes the subject without covering the thing the
    // officer came for. The store already separates the two.
    const bridge = read("src/features/focus-workspace/map-bridge.ts");
    expect(bridge).toContain('if (surface === "workspace") openWorkspace(subject);');
    expect(bridge).toContain("else setSubject(subject);");
  });
});

/* ═══════ 5. The map's mode axes stay separate ═══════ */

describe("the map's mode axes are not one enum", () => {
  /*
   * `OperatingMode` is the officer's operational lens — what they are
   * working on. `ViewMode` is the perspective — how it draws. A map
   * interaction mode (live, filter, analysis, replay, intelligence) is a
   * third, separate axis arriving in M7.2b. Merging any two would
   * recreate the vocabulary drift where one name carries two meanings
   * and a consumer cannot tell which it has.
   */
  const selection = read("src/services/geospatial/selection.ts");
  const types = read("src/services/geospatial/types.ts");

  it("keeps the seven operational lenses", () => {
    for (const mode of [
      "NATIONAL",
      "PORT",
      "VESSEL",
      "INCIDENT",
      "INVESTIGATION",
      "HISTORY",
      "REPLAY",
    ]) {
      expect(selection).toContain(`"${mode}"`);
    }
  });

  it("keeps perspective separate from lens", () => {
    expect(types).toMatch(/export type ViewMode = "2D" \| "3D"/);
    expect(selection).toContain("**Not `ViewMode`.**");
  });

  it("declares no combined mode enum", () => {
    const combined = sourceFiles().filter((file) =>
      /export type (MapMode|CombinedMode|MapModeAxis)\b/.test(read(file)),
    );
    expect(combined).toEqual([]);
  });
});

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) out.push(path);
    }
  };
  walk("src");
  return out;
}
