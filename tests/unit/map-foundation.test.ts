/**
 * M7.2b — the map's control foundation.
 *
 * Three axes, one catalogue, one map instance.
 *
 * The map had eight logical layers while the product describes about
 * forty, one mode enum doing the work of two, and no way to express a
 * capability Seaphore cannot obtain at all. These pin the shape that
 * replaced that, and — more importantly — pin the honesty rules, because
 * a catalogue of forty layers is only an improvement if none of them
 * pretends to draw something.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createDefaultLayerRegistry } from "@/services/geospatial/layer-registry";
import { MAP_INTERACTION_MODES } from "@/services/geospatial/types";
import { OPERATING_MODES } from "@/services/geospatial/selection";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const TYPES = read("src/services/geospatial/types.ts");
const SERVICE = read("src/services/geospatial/shared-geospatial-service.ts");
const CHROME = read("src/features/maritime/MapChrome.tsx");
const RENDERER = read("src/services/geospatial/renderers/maplibre-renderer.ts");

const registry = createDefaultLayerRegistry();

/* ═══════ 1. Three axes, not one ═══════ */

describe("the map keeps its axes separate", () => {
  it("keeps the seven operational lenses", () => {
    expect([...OPERATING_MODES]).toEqual([
      "NATIONAL",
      "PORT",
      "VESSEL",
      "INCIDENT",
      "INVESTIGATION",
      "HISTORY",
      "REPLAY",
    ]);
  });

  it("adds the five interaction modes alongside them", () => {
    expect([...MAP_INTERACTION_MODES]).toEqual([
      "LIVE",
      "FILTER",
      "ANALYSIS",
      "REPLAY",
      "INTELLIGENCE",
    ]);
  });

  it("does not collapse the two into one enum", () => {
    /*
     * `REPLAY` appears in both vocabularies and means different things:
     * a lens the officer is working in, and an interaction they are
     * performing. That overlap is exactly why one enum would not do.
     */
    expect(TYPES).toContain("export type MapInteractionMode");
    expect(TYPES).not.toMatch(/export type MapMode\b/);
    expect(SERVICE).toContain("setInteractionMode");
    expect(SERVICE).toContain("setOperatingMode");
  });

  it("gives each axis its own URL key", () => {
    // `mode` is the lens; `imode` is the interaction. One key carrying
    // both would make a shared link restore a state nobody chose.
    expect(SERVICE).toContain('params.set("mode", state.operatingMode)');
    expect(SERVICE).toContain('params.set("imode", state.interactionMode)');
  });

  it("validates a restored interaction mode against its own vocabulary", () => {
    // A URL is untrusted input even when it is only naming a mode.
    expect(SERVICE).toContain("MAP_INTERACTION_MODES as readonly string[]");
  });
});

/* ═══════ 2. Perspective ═══════ */

describe("2D, 3D and Globe are one map", () => {
  it("declares three view modes", () => {
    expect(TYPES).toContain('export type ViewMode = "2D" | "3D" | "GLOBE"');
  });

  it("switches projection on the mounted instance", () => {
    /*
     * Globe is a MapLibre projection, so it is one call on the live map
     * — no second instance, no remount, and nothing that would put the
     * mount-reliability work back at risk.
     */
    expect(RENDERER).toContain("setProjection(view: ViewMode)");
    expect(RENDERER).toMatch(/const type = view === "GLOBE" \? "globe" : "mercator"/);
    expect(RENDERER).not.toMatch(/new maplibre\.Map\(/g.source + ".*globe");
  });

  it("reports a projection the engine declines", () => {
    // An officer who pressed Globe and saw nothing change needs to know
    // the engine refused, not that their click was lost.
    expect(RENDERER).toContain("was declined");
    expect(RENDERER).toContain('scope: "maplibre:projection"');
  });

  it("cycles the perspective from one control", () => {
    expect(CHROME).toContain("NEXT_PERSPECTIVE");
    expect(CHROME).toMatch(/"2D": "3D"/);
    expect(CHROME).toMatch(/"3D": "GLOBE"/);
    expect(CHROME).toMatch(/GLOBE: "2D"/);
  });

  it("leaves the globe level", () => {
    // Pitch belongs to the tilt. An officer spinning out should not find
    // the world tilted as well.
    expect(CHROME).toContain('pitch: next === "3D" ? 50 : 0');
  });
});

/* ═══════ 3. The catalogue ═══════ */

describe("the layer catalogue is complete and honest", () => {
  const layers = registry.list();

  it("covers all seven capability groups", () => {
    const groups = new Set(layers.map((l) => l.group));
    for (const group of [
      "VESSELS",
      "PORTS_INFRASTRUCTURE",
      "OPERATIONAL",
      "TRADE_LOGISTICS",
      "RISK_INTELLIGENCE",
      "MARITIME_ZONES",
      "ENVIRONMENT",
      "INVESTIGATIONS",
    ]) {
      expect(groups, `${group} has no layers`).toContain(group);
    }
  });

  it("declares a status for every layer", () => {
    const valid = new Set(["ready", "pending-source", "unavailable"]);
    for (const layer of layers) {
      expect(`${layer.id}: ${layer.status}`).toBe(`${layer.id}: ${layer.status}`);
      expect(valid.has(layer.status), `${layer.id} has status "${layer.status}"`).toBe(true);
    }
  });

  it("gives every layer without a source a stated reason", () => {
    /*
     * "No provider" is not an explanation. An officer looking at a dark
     * layer needs to know whether it is a licence Seaphore does not
     * hold, a register that exists only on paper, or a feed nobody has
     * wired — three different situations with three different answers.
     */
    const unexplained = layers
      .filter((l) => l.status !== "ready")
      .filter((l) => !l.pendingReason || l.pendingReason.length < 20)
      .map((l) => l.id);
    expect(unexplained).toEqual([]);
  });

  it("draws nothing behind a layer that has no source", () => {
    // The whole point of the catalogue: a toggle with no renderer cannot
    // produce fabricated features, because there is no renderer.
    for (const layer of layers.filter((l) => l.status !== "ready")) {
      if (layer.renderLayerIds.length === 0) continue;
      // A pending layer may name render ids it will use once wired, but
      // it must never be visible by default.
      expect(layer.defaultVisible, `${layer.id} is pending and on by default`).toBe(false);
    }
  });

  it("turns on only what is ready", () => {
    const onByDefault = layers.filter((l) => l.defaultVisible);
    for (const layer of onByDefault) {
      expect(layer.status, `${layer.id} is on by default`).toBe("ready");
    }
  });

  it("separates a missing feed from an unobtainable one", () => {
    /*
     * `pending-source` is a backlog item an officer can expect resolved.
     * `unavailable` is a permanent answer. Collapsing them would leave
     * officers waiting for a layer that is never coming.
     */
    const unavailable = layers.filter((l) => l.status === "unavailable");
    expect(unavailable.length).toBeGreaterThan(0);
    for (const layer of unavailable) {
      expect(layer.pendingReason ?? "").toMatch(/licence|licensed|not available/i);
    }
  });

  it("requires a renderer only where a layer claims to be ready", () => {
    for (const layer of layers.filter((l) => l.status === "ready")) {
      expect(layer.renderLayerIds.length, `${layer.id} is ready and draws nothing`).toBeGreaterThan(
        0,
      );
    }
  });

  it("makes the EEZ an officer-controlled layer", () => {
    // It was drawn from the start with no catalogue entry, so an officer
    // could see the boundary and had no way to turn it off.
    const eez = registry.get("nigeria-eez");
    expect(eez?.status).toBe("ready");
    expect(eez?.renderLayerIds.length).toBeGreaterThan(0);
  });
});

/* ═══════ 4. One map state ═══════ */

describe("there is one map state owner", () => {
  it("keeps every axis in MapState", () => {
    for (const field of ["viewMode", "operatingMode", "interactionMode"]) {
      expect(TYPES).toContain(`readonly ${field}`);
    }
  });

  it("adds no second map store", () => {
    expect(SERVICE).not.toMatch(/\bcreate\(/);
    expect(CHROME).not.toMatch(/\bcreate\(/);
  });
});

/* ═══════ 5. What "All" means ═══════ */

describe("the All chip means the standard picture, not everything", () => {
  const CHROME_SRC = read("src/features/maritime/MapChrome.tsx");

  it("derives the standard bundle rather than declaring it twice", () => {
    /*
     * A layer is standard when it is `ready` and on by default — which
     * is already the definition of "the normal picture". A second list
     * would let the two drift and give an officer an All chip that
     * disagreed with what the map opened on.
     */
    expect(registry.standardLayerIds()).toEqual(
      registry
        .list()
        .filter((l) => l.status === "ready" && l.defaultVisible)
        .map((l) => l.id),
    );
  });

  it("opens with All selected, because All is what it opened with", () => {
    // The two sets are the same by construction, so the chip cannot be
    // unselected on a map nobody has touched.
    const standard = new Set(registry.standardLayerIds());
    for (const id of registry.defaultActiveLayers()) {
      expect(standard.has(id), `${id} is on by default but not standard`).toBe(true);
    }
  });

  it("leaves the voyage gazetteer out of the standard bundle", () => {
    /*
     * The overlay pulls an 850 KB gazetteer. It is meaningful when an
     * officer is working voyages and is noise on the national picture,
     * so a control promising "the usual layers" must not fetch it.
     */
    expect(registry.standardLayerIds()).not.toContain("voyages");
    expect(registry.get("voyages")?.defaultVisible).toBe(false);
  });

  it("leaves every other heavy or optional layer out too", () => {
    const standard = new Set(registry.standardLayerIds());
    // Buildings draw nothing below zoom 13; investigation areas are
    // drawn by an officer for a case, not shown by default.
    for (const id of ["buildings", "investigation-areas"]) {
      expect(standard.has(id), `${id} joined the standard bundle`).toBe(false);
    }
  });

  it("never switches on a layer with no source", () => {
    /*
     * Turning on Weather when no provider is connected would light a
     * chip that draws nothing and tell the officer the opposite of the
     * truth. "All" can only mean all of what actually reports.
     */
    for (const id of registry.standardLayerIds()) {
      expect(registry.get(id)?.status, `${id} is standard but not ready`).toBe("ready");
    }
  });

  it("asks the registry what standard means", () => {
    // Not a hard-coded list in the chip row, which would drift from the
    // catalogue the moment a layer changed status.
    expect(CHROME_SRC).toContain("layerRegistry.standardLayerIds()");
    expect(CHROME_SRC).not.toMatch(/CHIPS\.flatMap\(\(chip\) => known\(chip\.layers\)\)/);
  });

  it("gives every chip logical layer ids the registry recognises", () => {
    /*
     * The chips named render-layer ids — "eezBoundary", "aisTrack",
     * "riskHeatmap" — which `known()` filters out, so several chips
     * governed an empty set. A chip that toggles nothing looks like a
     * broken control.
     */
    const referenced = [...CHROME_SRC.matchAll(/layers: \[([^\]]*)\]/g)]
      .flatMap((m) => m[1]!.split(","))
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    const unknown = referenced.filter((id) => !registry.has(id));
    expect(unknown).toEqual([]);
  });
});
