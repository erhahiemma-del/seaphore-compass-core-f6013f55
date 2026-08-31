/**
 * Copilot → Intelligence Earth orchestration.
 *
 * What is guarded here is the boundary, not the phrasing: a sentence
 * becomes one of the closed action variants, and only `executeCopilotAction`
 * touches the map. Every case below asserts either that a real capability
 * ran through the canonical service, or that an absent one was refused in
 * words an officer can act on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeCopilotAction,
  isStateChanging,
  type CopilotAction,
} from "@/services/copilot/copilot-actions";
import { readMapControl } from "@/services/copilot/map-control-phrases";
import { EARTH_CAMERA_PRESETS } from "@/services/geospatial/earth-presets";
import { SharedGeospatialService } from "@/services/geospatial/shared-geospatial-service";

function service(): SharedGeospatialService {
  return new SharedGeospatialService();
}

function actionFor(text: string, imo: string | null = null): CopilotAction | null {
  const reading = readMapControl({ text, contextVesselImo: imo, contextVesselName: "TEST HULL" });
  return reading?.kind === "ACTION" ? reading.action : null;
}

describe("reading map-control instructions", () => {
  it("does not read an ordinary question as a map instruction", () => {
    expect(
      readMapControl({ text: "why is this vessel high risk?", contextVesselImo: "IMO-1" }),
    ).toBeNull();
    expect(readMapControl({ text: "who owns the Ocean Star", contextVesselImo: null })).toBeNull();
  });

  it("turns a layer on and off by its registered name", () => {
    expect(actionFor("show the anchorages layer")).toEqual({
      type: "SHOW_LAYER",
      layerId: "anchorages",
    });
    expect(actionFor("hide the weather layer")).toEqual({
      type: "HIDE_LAYER",
      layerId: "weather",
    });
  });

  it("refuses a layer Seaphore does not hold instead of guessing one", () => {
    const reading = readMapControl({ text: "show the pipeline layer", contextVesselImo: null });
    expect(reading?.kind).toBe("UNRESOLVED");
  });

  it("flies to an Intelligence Earth view", () => {
    expect(actionFor("fly to the global view")).toEqual({ type: "FLY_TO", presetId: "global" });
    expect(actionFor("show me the Nigeria view")).toEqual({ type: "FLY_TO", presetId: "nigeria" });
  });

  it("narrows the fleet by a dimension the model carries", () => {
    expect(actionFor("only show high risk vessels")).toEqual({
      type: "FILTER_VESSELS",
      patch: { riskLevel: "HIGH" },
    });
  });

  it("asks which dimension rather than inventing one", () => {
    const reading = readMapControl({ text: "filter vessels by tonnage", contextVesselImo: null });
    expect(reading?.kind).toBe("UNRESOLVED");
  });

  it("replays the vessel under discussion, never one it picked itself", () => {
    expect(actionFor("replay its last 24 hours", "IMO-9")).toEqual({
      type: "START_REPLAY",
      imo: "IMO-9",
      hours: 24,
    });
    expect(readMapControl({ text: "replay the last 24 hours", contextVesselImo: null })?.kind).toBe(
      "UNRESOLVED",
    );
    expect(actionFor("stop the replay", "IMO-9")).toEqual({ type: "STOP_REPLAY" });
  });

  it("opens evidence and briefings for the vessel in context", () => {
    expect(actionFor("show the evidence", "IMO-9")).toEqual({
      type: "SHOW_EVIDENCE",
      imo: "IMO-9",
    });
    expect(actionFor("generate a briefing", "IMO-9")).toMatchObject({ type: "GENERATE_BRIEF" });
  });
});

describe("carrying the actions out", () => {
  let sgs: SharedGeospatialService;
  beforeEach(() => {
    sgs = service();
  });

  it("toggles layer visibility through the canonical state", () => {
    const shown = executeCopilotAction(
      { type: "SHOW_LAYER", layerId: "weather" },
      { service: sgs },
    );
    expect(shown.ok).toBe(true);
    expect(sgs.get().activeLayers).toContain("weather");

    const hidden = executeCopilotAction(
      { type: "HIDE_LAYER", layerId: "weather" },
      { service: sgs },
    );
    expect(hidden.ok).toBe(true);
    expect(sgs.get().activeLayers).not.toContain("weather");
  });

  it("refuses a layer id the registry does not hold", () => {
    const result = executeCopilotAction(
      { type: "SHOW_LAYER", layerId: "pipelines-invented" },
      { service: sgs },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("pipelines-invented");
  });

  it("applies a preset's framing, not just its centre", () => {
    const apapa = EARTH_CAMERA_PRESETS.find((preset) => preset.id === "apapa")!;
    const result = executeCopilotAction({ type: "FLY_TO", presetId: "apapa" }, { service: sgs });
    expect(result.ok).toBe(true);
    const state = sgs.get();
    expect(state.center[0]).toBeCloseTo(apapa.center[0], 2);
    expect(state.pitch).toBe(apapa.pitch);
    expect(state.bearing).toBe(apapa.bearing);
  });

  it("refuses a view that does not exist and names the ones that do", () => {
    const result = executeCopilotAction({ type: "FLY_TO", presetId: "atlantis" }, { service: sgs });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Global");
  });

  it("only accepts filter dimensions the vessel model carries", () => {
    const ok = executeCopilotAction(
      { type: "FILTER_VESSELS", patch: { riskLevel: "HIGH" } },
      { service: sgs },
    );
    expect(ok.ok).toBe(true);
    expect(sgs.get().filters.riskLevel).toBe("HIGH");

    const bad = executeCopilotAction(
      { type: "FILTER_VESSELS", patch: { tonnage: 5000 } as never },
      { service: sgs },
    );
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain("tonnage");
  });

  it("replays through the injected timeline and reports when there is nothing recorded", () => {
    const start = vi.fn().mockReturnValue(true);
    const stop = vi.fn();
    const ready = executeCopilotAction(
      { type: "START_REPLAY", imo: "IMO-1", hours: 24 },
      { service: sgs, replay: { start, stop }, knownImos: ["IMO-1"] },
    );
    expect(ready.ok).toBe(true);
    expect(start).toHaveBeenCalledWith({ imo: "IMO-1", hours: 24 });
    expect(sgs.get().selection?.kind).toBe("vessel");

    executeCopilotAction({ type: "STOP_REPLAY" }, { service: sgs, replay: { start, stop } });
    expect(stop).toHaveBeenCalled();

    const empty = executeCopilotAction(
      { type: "START_REPLAY" },
      { service: sgs, replay: { start: () => false, stop } },
    );
    expect(empty.ok).toBe(false);
    expect(empty.summary).toContain("nothing recorded");
  });

  it("says it cannot replay when no timeline is connected", () => {
    const result = executeCopilotAction({ type: "START_REPLAY" }, { service: sgs });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("No replay timeline");
  });

  it("opens evidence by selecting the canonical entity", () => {
    const result = executeCopilotAction(
      { type: "SHOW_EVIDENCE", imo: "IMO-7" },
      { service: sgs, knownImos: ["IMO-7"] },
    );
    expect(result.ok).toBe(true);
    expect(sgs.get().selection).toMatchObject({ kind: "vessel", imo: "IMO-7" });
  });

  it("refuses evidence for a hull the map is not holding", () => {
    const result = executeCopilotAction(
      { type: "SHOW_EVIDENCE", imo: "IMO-404" },
      { service: sgs, knownImos: ["IMO-7"] },
    );
    expect(result.ok).toBe(false);
    expect(sgs.get().selection).toBeNull();
  });

  it("admits there is no comparison surface rather than implying one", () => {
    const result = executeCopilotAction(
      { type: "COMPARE_ENTITIES", imos: ["IMO-1", "IMO-2"] },
      { service: sgs, knownImos: ["IMO-1", "IMO-2"] },
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("no side-by-side comparison surface");
  });

  it("gates a briefing behind confirmation and then requests it", () => {
    const generateBrief = vi.fn();
    const gated = executeCopilotAction(
      { type: "GENERATE_BRIEF", imo: "IMO-1" },
      { service: sgs, generateBrief },
    );
    expect(gated.ok).toBe(false);
    expect(generateBrief).not.toHaveBeenCalled();

    const done = executeCopilotAction(
      { type: "GENERATE_BRIEF", imo: "IMO-1", subject: "TEST HULL" },
      { service: sgs, generateBrief, confirmed: true },
    );
    expect(done.ok).toBe(true);
    expect(generateBrief).toHaveBeenCalledWith({ imo: "IMO-1", subject: "TEST HULL" });
  });

  it("classifies the reversible actions as reversible and the briefing as a write", () => {
    expect(isStateChanging({ type: "SHOW_LAYER", layerId: "weather" })).toBe(false);
    expect(isStateChanging({ type: "FLY_TO", presetId: "global" })).toBe(false);
    expect(isStateChanging({ type: "STOP_REPLAY" })).toBe(false);
    expect(isStateChanging({ type: "GENERATE_BRIEF" })).toBe(true);
  });
});
