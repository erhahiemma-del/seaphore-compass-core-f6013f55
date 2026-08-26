/**
 * M2.5 — Map Visual Intelligence System.
 *
 * These tests guard the parts of the visual language that fail *quietly*
 * when they break. Three classes of silent failure are covered:
 *
 *   1. A vessel whose course nobody reported drawn as one steaming north.
 *      Nothing throws; the map simply asserts a bearing that was never
 *      reported. This is the fabrication the whole sprite vocabulary
 *      exists to prevent, so it is asserted from both ends — the
 *      resolver and the composed sprite id.
 *
 *   2. A MapLibre paint expression rejected at `addLayer`. MapLibre does
 *      not throw on an invalid expression: it declines the layer and the
 *      map carries on without it. Two shapes cause this and both have
 *      already caused it in this repository — a `["zoom"]` that is not
 *      the outermost element, and a bare array used as an expression
 *      output where `["literal", …]` is required.
 *
 *   3. A confidence ring drawn for an entity nobody graded. The ring is
 *      filtered on the *presence* of a property, so a projection that
 *      defaulted the tier instead of omitting it would put a grade on
 *      every vessel on the map.
 *
 * The global navigation contract is re-asserted at the bottom. It is
 * covered by `map-scope.test.ts` too; repeating the two load-bearing
 * values here is deliberate, because M2.5 touches the same paint and
 * zoom machinery and a regression must fail the sprint's own suite.
 */
import { describe, expect, it } from "vitest";

import { MAP_SCOPES, ZOOM_BANDS, ZOOM_LIMITS, zoomBandFor } from "@/services/geospatial/constants";
import {
  CONFIDENCE_RING_STYLES,
  CONFIDENCE_TIERS,
  INTELLIGENCE_BADGE_OFFSETS,
  confidenceTierFor,
  interactionStateFor,
  type ConfidenceTier,
} from "@/services/geospatial/entity-visual";
import { coastlineLayer, planMaritimeStyle } from "@/services/geospatial/map-style";
import { graticuleOpacityExpression } from "@/services/geospatial/graticule";
import { toVesselFeature } from "@/services/geospatial/vessel";
import {
  VESSEL_SILHOUETTES,
  resolveHeading,
  vesselSpriteId,
  vesselSpriteIds,
} from "@/services/geospatial/vessel-visual";
import type { Vessel } from "@/services/geospatial/vessel";

/* ═══════ helpers ═══════ */

function vessel(overrides: Partial<Vessel> = {}): Vessel {
  return {
    identity: { imo: "9111111", name: "TEST", type: "TANKER" },
    position: {
      lon: 3.4,
      lat: 6.4,
      heading: 0,
      speed: 8,
      timestamp: new Date().toISOString(),
    },
    riskLevel: "LOW",
    attentionScore: 0,
    ...overrides,
  } as Vessel;
}

/**
 * Walk every array in a paint/layout value, yielding each sub-expression.
 *
 * Written by hand rather than pulled from MapLibre so the assertions
 * below do not depend on the library agreeing with itself.
 */
function* subExpressions(value: unknown): Generator<unknown[]> {
  if (!Array.isArray(value)) return;
  yield value;
  for (const child of value) yield* subExpressions(child);
}

/**
 * True when `["zoom"]` appears somewhere MapLibre will reject it.
 *
 * `["zoom"]` is legal in exactly one place: as the *input* of the
 * outermost `interpolate` or `step`. That is index 2 for `interpolate`
 * (which takes an interpolation type first) and index 1 for `step`.
 * Anywhere else — inside a stop's output value, inside a `case`, inside
 * a `*` — the whole layer is declined, silently.
 */
function hasNestedZoom(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const inputIndex = value[0] === "interpolate" ? 2 : value[0] === "step" ? 1 : -1;
  // Not a zoom-driven expression at all: any `["zoom"]` inside it is misplaced.
  const searchFrom = inputIndex === -1 ? 0 : inputIndex + 1;
  return value
    .slice(searchFrom)
    .some((child) => [...subExpressions(child)].some((expr) => expr[0] === "zoom"));
}

/* ═══════ 1. Vessel symbols — heading ═══════ */

describe("vessel symbols distinguish a reported course from a defaulted one", () => {
  it("a reported course resolves as known and drives a directional sprite", () => {
    const resolved = resolveHeading(137, true);
    expect(resolved.known).toBe(true);
    expect(resolved.degrees).toBe(137);
    expect(vesselSpriteId("low", "wedge", resolved.known)).toBe("vessel-low-wedge");
  });

  it("an unreported course resolves as unknown and draws the -nodir sprite", () => {
    const resolved = resolveHeading(0, false);
    expect(resolved.known).toBe(false);
    expect(vesselSpriteId("low", "wedge", resolved.known)).toBe("vessel-low-wedge-nodir");
  });

  it("a heading of zero with no report never renders as due north", () => {
    // The exact shape of the original defect: `heading` is a required
    // number, so a source with no course still yields 0. Without the
    // separate flag this is indistinguishable from a real northerly
    // bearing, and the renderer would rotate the hull to point north.
    const feature = toVesselFeature(
      vessel({
        position: { ...vessel().position, heading: 0, headingReported: false },
      }),
    );
    expect(feature.properties.headingKnown).toBe(false);
    expect(feature.properties.iconId).toMatch(/-nodir$/);
  });

  it("every sprite a vessel can ask for is one the renderer registers", () => {
    /*
     * Silhouettes come from `VESSEL_SILHOUETTES` rather than a literal
     * list. The literal named "disc", which was later renamed "hull", so
     * the test asked for a sprite nothing builds and reported a failure
     * about registration when the real change was vocabulary. Deriving
     * the asking side still catches the drift that matters — an id
     * `vesselIconId()` can produce that the renderer never registers.
     */
    const registered = new Set(vesselSpriteIds());
    for (const directional of [true, false]) {
      for (const silhouette of VESSEL_SILHOUETTES) {
        expect(
          registered.has(vesselSpriteId("critical", silhouette, directional)),
          `${silhouette} (${directional ? "directional" : "nodir"}) is unregistered`,
        ).toBe(true);
      }
    }
  });

  it("a non-directional sprite exists for every colour and silhouette", () => {
    // The bug this catches: `-nodir` sprites were built and uploaded but
    // unreachable, because the renderer re-derived `icon-image` from
    // risk alone and had no branch for the suffix.
    const nodir = vesselSpriteIds().filter((id) => id.endsWith("-nodir"));
    expect(nodir).toHaveLength(vesselSpriteIds().length / 2);
  });
});

/* ═══════ 2. Confidence ═══════ */

describe("the confidence ladder resolves and is legible without colour", () => {
  it("resolves all six stored levels onto the four map tiers", () => {
    expect(confidenceTierFor("VERIFIED")).toBe("verified");
    expect(confidenceTierFor("AUDITED")).toBe("verified");
    expect(confidenceTierFor("OBSERVED")).toBe("observed");
    expect(confidenceTierFor("CORROBORATED")).toBe("observed");
    expect(confidenceTierFor("DECLARED")).toBe("inferred");
    expect(confidenceTierFor("INFERRED")).toBe("inferred");
  });

  it("treats a missing confidence value as unconfirmed", () => {
    expect(confidenceTierFor(null)).toBe("unconfirmed");
    expect(confidenceTierFor(undefined)).toBe("unconfirmed");
  });

  it("declares a ring style for every tier", () => {
    for (const tier of CONFIDENCE_TIERS) {
      expect(CONFIDENCE_RING_STYLES[tier]).toBeDefined();
      expect(CONFIDENCE_RING_STYLES[tier].tier).toBe(tier);
    }
    expect(CONFIDENCE_TIERS).toHaveLength(4);
  });

  it("weakens every non-colour channel monotonically down the ladder", () => {
    // The point of the ladder is that it survives greyscale. Each of the
    // three channels must order the tiers the same way, so any one of
    // them read alone still says which is better evidenced.
    const ordered = CONFIDENCE_TIERS.map((tier) => CONFIDENCE_RING_STYLES[tier]);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].fillOpacity).toBeLessThanOrEqual(ordered[i - 1].fillOpacity);
      expect(ordered[i].strokeOpacity).toBeLessThanOrEqual(ordered[i - 1].strokeOpacity);
      expect(ordered[i].strokeWidth).toBeLessThanOrEqual(ordered[i - 1].strokeWidth);
    }
  });

  it("omits the tier entirely for a vessel nobody graded", () => {
    // Load-bearing: the ring layer filters on `["has", "confidenceTier"]`.
    // A defaulted tier would draw an `unconfirmed` ring around every
    // vessel on the map, which reads as an assessment nobody made.
    const feature = toVesselFeature(vessel());
    expect("confidenceTier" in feature.properties).toBe(false);
  });

  it("carries the tier through when a vessel does have one", () => {
    const feature = toVesselFeature(vessel({ confidenceLevel: "CORROBORATED" }));
    expect(feature.properties.confidenceTier).toBe<ConfidenceTier>("observed");
  });
});

/* ═══════ 3. Intelligence signals ═══════ */

describe("intelligence signals are additive and never invented", () => {
  it("omits the signal for a vessel with nothing attached", () => {
    const feature = toVesselFeature(vessel());
    expect("intelligenceSignal" in feature.properties).toBe(false);
  });

  it("carries a signal through without replacing the hull", () => {
    const feature = toVesselFeature(vessel({ intelligenceSignal: "investigation" }));
    expect(feature.properties.intelligenceSignal).toBe("investigation");
    // The vessel keeps its own type and heading — the badge is additive.
    expect(feature.properties.category).toBe("TANKER");
    expect(feature.properties.iconId).toContain("wedge");
  });

  it("gives each signal a distinct badge position", () => {
    const positions = Object.values(INTELLIGENCE_BADGE_OFFSETS).map((offset) => offset.join(","));
    expect(new Set(positions).size).toBe(positions.length);
  });
});

/* ═══════ 4. Entity interaction states ═══════ */

describe("interaction states do not conflict destructively", () => {
  it("ranks selection above hover", () => {
    // A cursor resting on the selected entity must not downgrade the
    // ring, which would make the selection appear to flicker.
    expect(interactionStateFor(true, true)).toBe("selected");
  });

  it("reports hover only when nothing is selected", () => {
    expect(interactionStateFor(false, true)).toBe("hover");
  });

  it("reports normal when neither applies", () => {
    expect(interactionStateFor(false, false)).toBe("normal");
    expect(interactionStateFor(undefined, undefined)).toBe("normal");
  });
});

/* ═══════ 5. Zoom bands ═══════ */

describe("zoom bands cover the whole navigable range", () => {
  it("starts at the global scope's floor and ends at its ceiling", () => {
    expect(ZOOM_BANDS.worldMin).toBe(MAP_SCOPES.global.minZoom);
    expect(ZOOM_BANDS.operationalMax).toBe(ZOOM_LIMITS.max);
  });

  it("classifies each band's interior correctly", () => {
    expect(zoomBandFor(1)).toBe("world");
    expect(zoomBandFor(2)).toBe("world");
    expect(zoomBandFor(5)).toBe("regional");
    expect(zoomBandFor(9)).toBe("operational");
    expect(zoomBandFor(18)).toBe("operational");
  });

  it("leaves no gap between bands", () => {
    expect(ZOOM_BANDS.regionalMin).toBe(ZOOM_BANDS.worldMax);
    expect(ZOOM_BANDS.operationalMin).toBe(ZOOM_BANDS.regionalMax);
  });
});

/* ═══════ 6. Expressions MapLibre will actually accept ═══════ */

describe("generated paint expressions are shaped the way MapLibre requires", () => {
  it("keeps zoom outermost in the graticule ramp", () => {
    const expression = graticuleOpacityExpression();
    expect(Array.isArray(expression)).toBe(true);
    expect((expression as unknown[])[0]).toBe("interpolate");
    expect(hasNestedZoom(expression)).toBe(false);
  });

  it("anchors the graticule ramp at the world floor, not at zoom 4", () => {
    // A ramp whose first stop is 4 does not fade below it — MapLibre
    // clamps to the first stop, so the entire world view was drawn at
    // regional weight over the extent with the most lines in frame.
    const stops = graticuleOpacityExpression() as unknown[];
    const firstStop = stops[3];
    expect(firstStop).toBe(MAP_SCOPES.global.minZoom);
  });

  it("keeps zoom outermost in every coastline paint property", () => {
    const paint = coastlineLayer().paint as Record<string, unknown>;
    for (const value of Object.values(paint)) {
      expect(hasNestedZoom(value)).toBe(false);
    }
  });

  it("anchors the coastline ramps at the world floor", () => {
    const paint = coastlineLayer().paint as Record<string, unknown[]>;
    for (const property of ["line-width", "line-opacity"]) {
      expect(paint[property][3]).toBe(ZOOM_BANDS.worldMin);
    }
  });

  it("keeps zoom outermost in every planned style edit", () => {
    const edits = planMaritimeStyle([
      { id: "place_country_1", type: "symbol", "source-layer": "place" },
      { id: "boundary_country_inner", type: "line", "source-layer": "boundary" },
      { id: "watername_sea", type: "symbol", "source-layer": "water_name", minzoom: 5 },
      { id: "water", type: "fill", "source-layer": "water" },
    ]);
    expect(edits.length).toBeGreaterThan(0);
    for (const edit of edits) {
      expect(hasNestedZoom(edit.value)).toBe(false);
    }
  });
});

/* ═══════ 7. Label hierarchy ═══════ */

describe("the label hierarchy changes with the reading band", () => {
  const placeEdits = planMaritimeStyle([
    { id: "place_country_1", type: "symbol", "source-layer": "place" },
  ]);

  it("emits both an opacity ramp and a size ramp for place labels", () => {
    const properties = placeEdits.map((edit) => edit.property);
    expect(properties).toContain("text-opacity");
    expect(properties).toContain("text-size");
  });

  it("lowers the sea-label threshold rather than raising it", () => {
    // Only ever a *lowering*: raising a threshold would hide a label the
    // basemap intended to draw, which is a subtraction dressed up as a
    // retune. The edit is emitted; `applyMaritimeStyle` refuses it when
    // the layer already appears earlier.
    const edits = planMaritimeStyle([
      { id: "watername_sea", type: "symbol", "source-layer": "water_name", minzoom: 5 },
    ]);
    const minzoomEdit = edits.find((edit) => edit.kind === "minzoom");
    expect(minzoomEdit).toBeDefined();
    expect(minzoomEdit!.value as number).toBeLessThan(5);
  });

  it("dims internal borders at world zoom relative to operational zoom", () => {
    const edits = planMaritimeStyle([
      { id: "boundary_country_inner", type: "line", "source-layer": "boundary" },
    ]);
    const opacity = edits.find((edit) => edit.property === "line-opacity")?.value as unknown[];
    expect(opacity[0]).toBe("interpolate");
    // Stops run [zoom, value, zoom, value, …] from index 3.
    const world = opacity[4] as number;
    const operational = opacity[opacity.length - 1] as number;
    expect(world).toBeLessThan(operational);
  });
});

/* ═══════ 8. Global navigation regression ═══════ */

describe("M2.5 does not re-cage the camera", () => {
  it("leaves global scope unbounded", () => {
    expect(MAP_SCOPES.global.maxBounds).toBeNull();
  });

  it("leaves the global zoom floor at 1", () => {
    expect(MAP_SCOPES.global.minZoom).toBe(1);
  });

  it("keeps the global extent spanning the whole world", () => {
    const [[west, south], [east, north]] = MAP_SCOPES.global.extent;
    expect(west).toBe(-180);
    expect(east).toBe(180);
    // ±85, not ±90: Web Mercator has no finite position beyond 85.051129.
    expect(south).toBeLessThanOrEqual(-85);
    expect(north).toBeGreaterThanOrEqual(85);
  });

  it("adds no bounds to any scope as a side effect of restyling", () => {
    // The regional scope keeps its own cage, which was always
    // deliberate; global must stay the unconstrained one.
    expect(MAP_SCOPES.regional.maxBounds).not.toBeNull();
    expect(MAP_SCOPES.global.maxBounds).toBeNull();
  });
});
