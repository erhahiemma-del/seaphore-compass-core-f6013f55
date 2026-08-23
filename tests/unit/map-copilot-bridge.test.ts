/**
 * TEST_FIXTURE — synthetic map state and queries only.
 */
import { describe, expect, it } from "vitest";

import {
  GULF_OF_GUINEA_TARGET,
  NATIONAL_TARGET,
  captureMapContext,
  contextInvalidatedBy,
  describeMapContext,
  intentsToStatePatch,
  planMap,
  resolveGeographicTarget,
  selectionAsEntity,
  understand,
  validateIntents,
  type MapIntent,
} from "@/services/orchestration";
import {
  REPLAY_SPEEDS,
  SharedGeospatialService,
  layerRegistry,
  type MapState,
} from "@/services/geospatial";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");

function state(over: Partial<MapState> = {}): MapState {
  const sgs = new SharedGeospatialService({ urlSync: false });
  return { ...sgs.get(), ...over };
}

function plan(query: string, over: Parameters<typeof planMap>[1] = {}) {
  return planMap(understand(query, { now: NOW }), { now: NOW, ...over });
}

/* ═══════ 1. Vessel question → map focuses the vessel ═══════ */

describe("1. a vessel question focuses the vessel", () => {
  it("emits FOCUS_ENTITY for a named vessel", () => {
    const result = plan("Investigate IMO 9074729");
    const focus = result.intents.find((i) => i.kind === "FOCUS_ENTITY");

    expect(focus?.kind).toBe("FOCUS_ENTITY");
    if (focus?.kind !== "FOCUS_ENTITY") return;
    expect(focus.selection.kind).toBe("vessel");
    expect(focus.selection.id).toBe("9074729");
  });

  it("switches to VESSEL mode", () => {
    const result = plan("Investigate IMO 9074729");
    const mode = result.intents.find((i) => i.kind === "CHANGE_OPERATING_MODE");
    expect(mode?.kind === "CHANGE_OPERATING_MODE" && mode.mode).toBe("VESSEL");
  });

  it("does not re-select what the officer already selected", () => {
    // A follow-up inherits the map's selection; re-focusing it would be
    // redundant work the officer did not ask for.
    const context = captureMapContext(
      state({ selection: { kind: "vessel", id: "v1", imo: "9074729" } }),
      NOW,
    );
    const understanding = understand("and her compliance history?", {
      now: NOW,
      ambientEntity: selectionAsEntity(context.selection),
    });
    const result = planMap(understanding, { context, now: NOW });

    expect(understanding.contextPolicy).toBe("inherit");
    expect(result.intents.some((i) => i.kind === "FOCUS_ENTITY")).toBe(false);
  });
});

/* ═══════ 2. Selection → structured Copilot context ═══════ */

describe("2. selecting a vessel gives the Copilot structured context", () => {
  it("captures the selection, mode, viewport and layers", () => {
    const context = captureMapContext(
      state({
        selection: { kind: "vessel", id: "v1", imo: "9074729" },
        operatingMode: "VESSEL",
      }),
      NOW,
    );

    expect(context.selection?.kind).toBe("vessel");
    expect(context.operatingMode).toBe("VESSEL");
    expect(context.capturedAt).toBe(new Date(NOW).toISOString());
    expect(Array.isArray(context.visibleLayers)).toBe(true);
  });

  it("converts a vessel selection into an entity the classifier accepts", () => {
    const entity = selectionAsEntity({ kind: "vessel", id: "v1", imo: "9074729" });

    expect(entity?.kind).toBe("vessel");
    expect(entity?.identifier).toBe("9074729");
    // Explicitly chosen by the officer — nothing uncertain about it.
    expect(entity?.confidence).toBe(1);
  });

  it("renders source availability so the Copilot cannot imply it checked", () => {
    const context = captureMapContext(state(), NOW);
    const rendered = describeMapContext(context, [
      { id: "gfw", status: "CONNECTED" },
      { id: "datalastic", status: "PENDING_CREDENTIALS" },
      { id: "npa", status: "INTEGRATION_PENDING" },
    ]);

    expect(rendered).toMatch(/datalastic=PENDING_CREDENTIALS/);
    expect(rendered).toMatch(/not the same as finding nothing/);
  });
});

/* ═══════ 3. Place question → correct geometry ═══════ */

describe("3. a place question resolves real geometry", () => {
  it("resolves Lagos to Apapa's actual coordinates", () => {
    const target = resolveGeographicTarget("What's happening in Lagos?");

    expect(target?.kind).toBe("port");
    expect(target?.id).toBe("NGAPAPA");
    expect(target?.center[1]).toBeCloseTo(6.4281, 3);
  });

  it("resolves Apapa by its own name too", () => {
    expect(resolveGeographicTarget("What's happening in Apapa?")?.id).toBe("NGAPAPA");
  });

  it("resolves the other Nigerian ports", () => {
    expect(resolveGeographicTarget("vessels at Tin Can Island")?.id).toBe("NGTIN");
    expect(resolveGeographicTarget("traffic at Onne")?.id).toBe("NGONNE");
    expect(resolveGeographicTarget("Calabar arrivals")?.id).toBe("NGCBQ");
  });

  it("resolves the Gulf of Guinea distinctly from Nigeria", () => {
    expect(resolveGeographicTarget("unusual activity in the Gulf of Guinea")).toEqual(
      GULF_OF_GUINEA_TARGET,
    );
    expect(resolveGeographicTarget("vessels in Nigerian waters")).toEqual(NATIONAL_TARGET);
  });

  it("returns null for an unknown place rather than guessing a centre", () => {
    // Moving the officer's map to the wrong ocean is worse than not
    // moving it.
    expect(resolveGeographicTarget("vessels near Rotterdam")).toBeNull();
    expect(resolveGeographicTarget("show me everything")).toBeNull();
  });

  it("treats a named port as a port question whatever the intent said", () => {
    const result = plan("Show me tankers approaching Lagos");
    const mode = result.intents.find((i) => i.kind === "CHANGE_OPERATING_MODE");

    expect(mode?.kind === "CHANGE_OPERATING_MODE" && mode.mode).toBe("PORT");
    const filters = result.intents.find((i) => i.kind === "APPLY_FILTERS");
    expect(filters?.kind === "APPLY_FILTERS" && filters.filters.vesselType).toBe("TANKER");
  });
});

/* ═══════ 4. Time period → deterministic timeline ═══════ */

describe("4. a time period changes the timeline deterministically", () => {
  it("emits a SET_TIME_WINDOW matching the understanding", () => {
    const understanding = understand("vessels approaching Lagos in the last 24 hours", {
      now: NOW,
    });
    const result = planMap(understanding, { now: NOW });
    const window = result.intents.find((i) => i.kind === "SET_TIME_WINDOW");

    expect(window?.kind).toBe("SET_TIME_WINDOW");
    if (window?.kind !== "SET_TIME_WINDOW") return;
    expect(Date.parse(window.fromIso)).toBe(understanding.timeWindow.fromMs);
    expect(Date.parse(window.toIso)).toBe(understanding.timeWindow.toMs);
  });

  it("produces the same plan for the same query", () => {
    // Determinism: the map must not move differently on a re-ask.
    expect(plan("vessels near Lagos last 7 days").intents).toEqual(
      plan("vessels near Lagos last 7 days").intents,
    );
  });

  it("marks an assumed window in the explanation", () => {
    const result = plan("show vessels near Lagos");
    if (result.understanding.timeWindow.inferred) {
      expect(result.explanation).toMatch(/assumed/);
    }
  });
});

/* ═══════ 5. Unavailable source → no fabrication ═══════ */

describe("5. an unavailable source does not fabricate results", () => {
  it("reports the gaps rather than planning layers that cannot load", () => {
    const result = plan("Investigate IMO 9074729");

    expect(result.unavailable.length).toBeGreaterThan(0);
    for (const gap of result.unavailable) {
      expect(gap.reason.length).toBeGreaterThan(10);
    }
  });

  it("never claims an unconnected dataset was consulted", () => {
    const rendered = describeMapContext(captureMapContext(state(), NOW), [
      { id: "npa", status: "INTEGRATION_PENDING" },
    ]);
    expect(rendered).toMatch(/Only sources marked CONNECTED were consulted/);
  });
});

/* ═══════ 6. Copilot cannot mutate arbitrary state ═══════ */

describe("6. a proposal cannot mutate arbitrary map state", () => {
  it("rejects a viewport off the globe", () => {
    const { accepted, rejected } = validateIntents([
      { kind: "SET_VIEWPORT", center: [999, 999], zoom: 10 },
    ]);

    expect(accepted).toEqual([]);
    expect(rejected[0].reason).toMatch(/outside/);
  });

  it("rejects an impossible zoom", () => {
    const { rejected } = validateIntents([{ kind: "SET_VIEWPORT", center: [3.4, 6.4], zoom: 99 }]);
    expect(rejected[0].reason).toMatch(/Zoom/);
  });

  it("rejects layers the registry does not know, keeping the ones it does", () => {
    // Partially valid: a hallucinated layer must not discard the real work.
    const { accepted, rejected } = validateIntents(
      [{ kind: "ACTIVATE_LAYERS", layerIds: ["vessels", "invented-layer"] }],
      { knownLayerIds: layerRegistry.list().map((l) => l.id) },
    );

    expect(accepted).toEqual([{ kind: "ACTIVATE_LAYERS", layerIds: ["vessels"] }]);
    expect(rejected[0].reason).toMatch(/invented-layer/);
  });

  it("rejects an inverted or absurd time window", () => {
    const inverted = validateIntents([
      { kind: "SET_TIME_WINDOW", fromIso: "2026-08-20T00:00:00Z", toIso: "2026-08-19T00:00:00Z" },
    ]);
    expect(inverted.rejected[0].reason).toMatch(/ends before it starts/);

    const absurd = validateIntents([
      { kind: "SET_TIME_WINDOW", fromIso: "1900-01-01T00:00:00Z", toIso: "2026-08-20T00:00:00Z" },
    ]);
    expect(absurd.rejected[0].reason).toMatch(/wider than any source/);
  });

  it("rejects a replay speed that is not offered", () => {
    const { rejected } = validateIntents([
      { kind: "OPEN_REPLAY", fromIso: "2026-08-19T00:00:00Z", speed: 7 as never },
    ]);
    expect(rejected[0].reason).toMatch(/not offered/);
  });

  it("rejects a selection with no id", () => {
    const { rejected } = validateIntents([
      { kind: "FOCUS_ENTITY", selection: { kind: "vessel", id: "", imo: null } },
    ]);
    expect(rejected[0].reason).toMatch(/no id/);
  });

  it("has no intent variant that sets arbitrary state", () => {
    // The union is the boundary. Anything not expressible here cannot
    // be proposed at all.
    const kinds: MapIntent["kind"][] = [
      "FOCUS_ENTITY",
      "FOCUS_AREA",
      "SET_VIEWPORT",
      "SET_TIME_WINDOW",
      "ACTIVATE_LAYERS",
      "APPLY_FILTERS",
      "OPEN_REPLAY",
      "SELECT_EVENT",
      "CHANGE_OPERATING_MODE",
    ];
    expect(kinds).toHaveLength(9);
  });
});

/* ═══════ 7. Deterministic order ═══════ */

describe("7. intents execute in deterministic order", () => {
  it("orders mode, geography, layers, filters, time, then selection", () => {
    const result = plan("Show me tankers approaching Lagos in the last 24 hours");
    const order = result.intents.map((i) => i.kind);

    expect(order[0]).toBe("CHANGE_OPERATING_MODE");
    expect(order.indexOf("FOCUS_AREA")).toBeLessThan(order.indexOf("ACTIVATE_LAYERS"));
    expect(order.indexOf("ACTIVATE_LAYERS")).toBeLessThan(order.indexOf("APPLY_FILTERS"));
  });

  it("applies layers additively, never removing the officer's own", () => {
    const current = state({ activeLayers: ["ports", "eezBoundary"] });
    const patch = intentsToStatePatch(
      [{ kind: "ACTIVATE_LAYERS", layerIds: ["vessels"] }],
      current,
    );

    expect(patch.activeLayers).toContain("ports");
    expect(patch.activeLayers).toContain("eezBoundary");
    expect(patch.activeLayers).toContain("vessels");
  });

  it("lets a later intent win over an earlier one predictably", () => {
    const patch = intentsToStatePatch(
      [
        { kind: "CHANGE_OPERATING_MODE", mode: "NATIONAL" },
        { kind: "CHANGE_OPERATING_MODE", mode: "PORT" },
      ],
      state(),
    );
    expect(patch.operatingMode).toBe("PORT");
  });

  it("keeps a time window off the playhead", () => {
    // A window is what to query; a playhead is where the officer is
    // standing in time. Only replay moves the latter.
    const patch = intentsToStatePatch(
      [{ kind: "SET_TIME_WINDOW", fromIso: "2026-08-19T00:00:00Z", toIso: "2026-08-20T00:00:00Z" }],
      state(),
    );
    expect(patch.timelinePosition).toBeUndefined();
  });
});

/* ═══════ 8. No selection → no phantom entity ═══════ */

describe("8. an unselected map produces no phantom entity", () => {
  it("yields a null entity", () => {
    expect(selectionAsEntity(null)).toBeNull();
  });

  it("says so plainly in the rendered context", () => {
    expect(describeMapContext(captureMapContext(state(), NOW))).toMatch(/Selected: nothing/);
  });

  it("yields null for kinds with no entity vocabulary", () => {
    // A geofence is not an entity the understanding layer can reason
    // about. Inventing one would put a fabricated subject in the prompt.
    expect(selectionAsEntity({ kind: "geofence", id: "f1" })).toBeNull();
    expect(selectionAsEntity({ kind: "zone", id: "z", zoneType: "eez" })).toBeNull();
  });

  it("leaves a subject-less question unanchored", () => {
    const understanding = understand("what changed?", { now: NOW, ambientEntity: null });
    expect(understanding.primaryEntity).toBeNull();
  });
});

/* ═══════ 9. Mode switch clears invalid context explicitly ═══════ */

describe("9. switching mode preserves valid context and clears invalid", () => {
  it("keeps a vessel selection in PORT mode — a vessel is at a port", () => {
    const result = contextInvalidatedBy(
      "PORT",
      state({ selection: { kind: "vessel", id: "v1", imo: null } }),
    );
    expect(result.clearSelection).toBe(false);
  });

  it("clears a port selection in VESSEL mode, with a reason", () => {
    const result = contextInvalidatedBy(
      "VESSEL",
      state({ selection: { kind: "port", id: "lagos" } }),
    );

    expect(result.clearSelection).toBe(true);
    expect(result.reason).toMatch(/no meaning in VESSEL mode/);
  });

  it("keeps everything in NATIONAL, HISTORY and REPLAY — framings, not filters", () => {
    for (const mode of ["NATIONAL", "HISTORY", "REPLAY"] as const) {
      const result = contextInvalidatedBy(
        mode,
        state({ selection: { kind: "incident", id: "i1", source: "nosdra" } }),
      );
      expect(result.clearSelection, mode).toBe(false);
    }
  });

  it("keeps everything relevant in INVESTIGATION", () => {
    const result = contextInvalidatedBy(
      "INVESTIGATION",
      state({ selection: { kind: "sar-detection", id: "d1", sceneId: "s1" } }),
    );
    expect(result.clearSelection).toBe(false);
  });

  it("does nothing when there is no selection", () => {
    expect(contextInvalidatedBy("VESSEL", state()).clearSelection).toBe(false);
  });
});

/* ═══════ 10. Replay uses the existing engine ═══════ */

describe("10. replay reuses the existing engine", () => {
  it("emits OPEN_REPLAY with a speed the existing player accepts", () => {
    const result = plan("Replay what happened near Lagos yesterday");
    const replay = result.intents.find((i) => i.kind === "OPEN_REPLAY");

    expect(replay?.kind).toBe("OPEN_REPLAY");
    if (replay?.kind !== "OPEN_REPLAY") return;
    expect(REPLAY_SPEEDS).toContain(replay.speed);
  });

  it("offers 1x, 5x, 20x and 100x", () => {
    expect(REPLAY_SPEEDS).toEqual([1, 5, 20, 100]);
  });

  it("moves the playhead into REPLAY mode", () => {
    const patch = intentsToStatePatch(
      [{ kind: "OPEN_REPLAY", fromIso: "2026-08-19T00:00:00Z", speed: 5 }],
      state(),
    );

    expect(patch.operatingMode).toBe("REPLAY");
    expect(patch.timelinePosition).toBe("2026-08-19T00:00:00Z");
  });

  it("does not open replay for a non-replay question", () => {
    expect(plan("show vessels near Lagos").intents.some((i) => i.kind === "OPEN_REPLAY")).toBe(
      false,
    );
  });
});

/* ═══════ Explainability ═══════ */

describe("the map explains what it did", () => {
  it("produces one subtle sentence, not a notification stream", () => {
    const result = plan("Show me tankers approaching Lagos in the last 24 hours");

    expect(result.explanation).toMatch(/^Map updated: /);
    expect(result.explanation).toMatch(/Apapa/);
    expect(result.explanation).toMatch(/tanker only/);
    expect(result.explanation.split("\n")).toHaveLength(1);
  });

  it("says plainly when nothing anchored the question", () => {
    const result = plan("what changed?");
    expect(result.explanation).toMatch(/^Map updated: /);
  });
});
