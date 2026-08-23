import { describe, expect, it } from "vitest";

import {
  OPERATING_MODES,
  SharedGeospatialService,
  decodeSelection,
  describeSelection,
  encodeSelection,
  isSameSelection,
  modeForSelection,
  selectionKey,
  type MapSelection,
} from "@/services/geospatial";

function service() {
  return new SharedGeospatialService();
}

/* ─────────────────── the selection union ─────────────────── */

describe("MapSelection", () => {
  it("covers every selectable kind the brief names", () => {
    const kinds: MapSelection[] = [
      { kind: "vessel", id: "v1", imo: null },
      { kind: "port", id: "p1" },
      { kind: "terminal", id: "t1", portId: "p1" },
      { kind: "berth", id: "b1", terminalId: "t1" },
      { kind: "anchorage", id: "a1", portId: "p1" },
      { kind: "zone", id: "z1", zoneType: "eez" },
      { kind: "incident", id: "i1", source: "nosdra" },
      { kind: "sar-detection", id: "d1", sceneId: "s1" },
      { kind: "ais-gap", id: "g1", mmsi: "123456789" },
      { kind: "risk-event", id: "r1", subjectId: "v1" },
      { kind: "investigation", id: "inv1" },
      { kind: "infrastructure", id: "pipe1", assetType: "pipeline" },
      { kind: "geofence", id: "f1" },
    ];

    expect(kinds).toHaveLength(13);
    expect(new Set(kinds.map((k) => k.kind)).size).toBe(13);
  });

  it("gives each kind a stable key", () => {
    expect(selectionKey({ kind: "port", id: "lagos" })).toBe("port:lagos");
    expect(selectionKey(null)).toBe("none");
  });

  it("distinguishes a port from a vessel sharing an id", () => {
    // The bug the union exists to prevent: an id whose meaning depends on
    // context, read by the wrong renderer.
    const vessel: MapSelection = { kind: "vessel", id: "x", imo: null };
    const port: MapSelection = { kind: "port", id: "x" };

    expect(isSameSelection(vessel, port)).toBe(false);
  });

  it("describes a selection before its data resolves", () => {
    expect(describeSelection({ kind: "vessel", id: "v", imo: "9074729" })).toMatch(/IMO 9074729/);
    expect(describeSelection(null)).toBe("Nothing selected");
  });
});

/* ──────────────────── operating mode ────────────────────── */

describe("OperatingMode", () => {
  it("is separate from ViewMode", () => {
    const state = service().get();

    expect(state.viewMode).toBe("2D");
    expect(state.operatingMode).toBe("NATIONAL");
    // Two fields, two vocabularies. Overloading one would recreate the
    // drift G6.0 removed from the orchestration layer.
    expect(state.viewMode).not.toBe(state.operatingMode);
  });

  it("offers the seven intelligence contexts", () => {
    expect(OPERATING_MODES).toHaveLength(7);
    expect(OPERATING_MODES).toContain("NATIONAL");
    expect(OPERATING_MODES).toContain("REPLAY");
  });

  it("changing the rendering perspective does not change the context", () => {
    const sgs = service();
    sgs.setOperatingMode("PORT");
    sgs.switchView("3D");

    expect(sgs.get().viewMode).toBe("3D");
    expect(sgs.get().operatingMode).toBe("PORT");
  });

  it("derives the mode a selection implies", () => {
    expect(modeForSelection({ kind: "port", id: "lagos" })).toBe("PORT");
    expect(modeForSelection({ kind: "terminal", id: "t", portId: "p" })).toBe("PORT");
    expect(modeForSelection({ kind: "vessel", id: "v", imo: null })).toBe("VESSEL");
    expect(modeForSelection({ kind: "incident", id: "i", source: "nosdra" })).toBe("INCIDENT");
  });

  it("leaves the mode alone for kinds read within an existing context", () => {
    // A SAR detection is inspected inside whatever frame the officer
    // built. Forcing a mode change would throw that frame away.
    expect(modeForSelection({ kind: "sar-detection", id: "d", sceneId: "s" })).toBeNull();
    expect(modeForSelection({ kind: "zone", id: "z", zoneType: "eez" })).toBeNull();
  });
});

/* ───────────────── selection through SGS ────────────────── */

describe("SGS selection", () => {
  it("keeps the legacy fields derived, never parallel", () => {
    const sgs = service();
    sgs.select({ kind: "vessel", id: "v1", imo: "9074729" });

    const state = sgs.get();
    expect(state.selection?.kind).toBe("vessel");
    expect(state.selectedEntityId).toBe("v1");
    expect(state.selectedEntityImo).toBe("9074729");
  });

  it("clears the legacy IMO when the selection is not a vessel", () => {
    const sgs = service();
    sgs.select({ kind: "vessel", id: "v1", imo: "9074729" });
    sgs.select({ kind: "port", id: "lagos" });

    expect(sgs.get().selectedEntityId).toBe("lagos");
    // A port has no IMO. Leaving the previous one would let the drawer
    // render a vessel's identity against a port.
    expect(sgs.get().selectedEntityImo).toBeNull();
  });

  it("switches mode when the selection implies one", () => {
    const sgs = service();
    sgs.select({ kind: "port", id: "lagos" });

    // Clicking a port *is* asking for port mode.
    expect(sgs.get().operatingMode).toBe("PORT");
  });

  it("preserves the mode when the selection implies none", () => {
    const sgs = service();
    sgs.setOperatingMode("INVESTIGATION");
    sgs.select({ kind: "sar-detection", id: "d1", sceneId: "s1" });

    expect(sgs.get().operatingMode).toBe("INVESTIGATION");
  });

  it("clears everything on clearSelection", () => {
    const sgs = service();
    sgs.select({ kind: "vessel", id: "v1", imo: "9074729" });
    sgs.clearSelection();

    const state = sgs.get();
    expect(state.selection).toBeNull();
    expect(state.selectedEntityId).toBeNull();
    expect(state.selectedEntityImo).toBeNull();
  });

  it("keeps the deprecated selectEntity shim working", () => {
    const sgs = service();
    sgs.selectEntity("v1", "9074729");

    expect(sgs.get().selection).toEqual({ kind: "vessel", id: "v1", imo: "9074729" });
  });

  it("notifies subscribers on selection change", () => {
    const sgs = service();
    let calls = 0;
    const off = sgs.subscribe(() => calls++);
    sgs.select({ kind: "port", id: "lagos" });
    off();

    expect(calls).toBeGreaterThan(0);
  });
});

/* ──────────────────── URL round trip ────────────────────── */

describe("selection in the URL", () => {
  const cases: MapSelection[] = [
    { kind: "vessel", id: "v1", imo: "9074729" },
    { kind: "vessel", id: "v1", imo: null },
    { kind: "port", id: "lagos" },
    { kind: "terminal", id: "apapa", portId: "lagos" },
    { kind: "berth", id: "b4", terminalId: "apapa" },
    { kind: "anchorage", id: "a1", portId: "lagos" },
    { kind: "zone", id: "ng-eez", zoneType: "eez" },
    { kind: "incident", id: "sp1", source: "nosdra" },
    { kind: "sar-detection", id: "d1", sceneId: "S1A_001" },
    { kind: "ais-gap", id: "g1", mmsi: "657123400" },
    { kind: "risk-event", id: "r1", subjectId: "9074729" },
    { kind: "investigation", id: "inv1" },
    { kind: "infrastructure", id: "pl1", assetType: "pipeline" },
    { kind: "geofence", id: "f1" },
  ];

  it("round-trips every kind", () => {
    for (const selection of cases) {
      const encoded = encodeSelection(selection);
      expect(encoded, `${selection.kind} should encode`).toBeTruthy();
      expect(decodeSelection(encoded), `${selection.kind} should round-trip`).toEqual(selection);
    }
  });

  it("returns null for malformed input rather than a half-built selection", () => {
    // A corrupted link must open with nothing selected, never with a
    // partial selection the drawer then renders against.
    expect(decodeSelection("terminal:only-an-id")).toBeNull();
    expect(decodeSelection("garbage")).toBeNull();
    expect(decodeSelection("")).toBeNull();
    expect(decodeSelection(null)).toBeNull();
  });

  it("carries selection and mode through a shared link", () => {
    const sgs = service();
    sgs.select({ kind: "terminal", id: "apapa", portId: "lagos" });

    const params = sgs.toSearchParams();
    expect(params.get("sel")).toBe("terminal:apapa:lagos");
    expect(params.get("mode")).toBe("PORT");

    const restored = service();
    restored.loadFromURL(params.toString());

    expect(restored.get().selection).toEqual({
      kind: "terminal",
      id: "apapa",
      portId: "lagos",
    });
    expect(restored.get().operatingMode).toBe("PORT");
  });

  it("still opens a link shared before the selection model existed", () => {
    const legacy = new URLSearchParams({ vessel: "9074729" });
    const sgs = service();
    sgs.loadFromURL(legacy.toString());

    expect(sgs.get().selection).toEqual({
      kind: "vessel",
      id: "9074729",
      imo: "9074729",
    });
  });

  it("lets the modern parameter win over the legacy one", () => {
    const params = new URLSearchParams({ sel: "port:lagos", vessel: "9074729" });
    const sgs = service();
    sgs.loadFromURL(params.toString());

    expect(sgs.get().selection).toEqual({ kind: "port", id: "lagos" });
    expect(sgs.get().selectedEntityImo).toBeNull();
  });

  it("omits the default mode from the URL", () => {
    expect(service().toSearchParams().get("mode")).toBeNull();
  });

  it("ignores an unknown mode rather than adopting it", () => {
    const sgs = service();
    sgs.loadFromURL("mode=NONSENSE");
    expect(sgs.get().operatingMode).toBe("NATIONAL");
  });
});
