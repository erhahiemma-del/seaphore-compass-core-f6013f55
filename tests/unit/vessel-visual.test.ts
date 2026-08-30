/**
 * Vessel classification and heading resolution.
 *
 * The property under test throughout: the map never asserts something a
 * provider did not report. An unknown type is not guessed, and an
 * unreported course is not drawn as a bearing.
 */
import { describe, expect, it } from "vitest";

import {
  SUPPORTED_CATEGORIES,
  VESSEL_COLOR_KEYS,
  VESSEL_SILHOUETTES,
  VESSEL_VISUALS,
  classifyVessel,
  resolveHeading,
  toVesselFeature,
  vesselIconId,
  vesselSpriteId,
  vesselSpriteIds,
  type Vessel,
} from "@/services/geospatial";

/** TEST_FIXTURE — synthetic vessel, varied one axis at a time. */
function vessel(overrides: Partial<Vessel> = {}): Vessel {
  return {
    identity: { imo: "9074729", name: "TEST_FIXTURE MV ABC" },
    position: {
      lon: 3.4,
      lat: 6.4,
      heading: 90,
      speed: 12,
      timestamp: new Date().toISOString(),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    ...overrides,
  } as Vessel;
}

/* ═══════ Classification ═══════ */

describe("vessel type classification", () => {
  it("maps each reported type to its own family", () => {
    expect(classifyVessel("CONTAINER").category).toBe("CONTAINER");
    expect(classifyVessel("TANKER").category).toBe("TANKER");
    expect(classifyVessel("BULK").category).toBe("BULK");
    expect(classifyVessel("VEHICLE").category).toBe("VEHICLE");
  });

  it("classifies an absent type as UNKNOWN, never as a guess", () => {
    const visual = classifyVessel(undefined);
    expect(visual.category).toBe("UNKNOWN");
    expect(visual.label).toBe("Unspecified vessel");
  });

  it("records whether the type was reported at all", () => {
    // The distinction the legend needs: nobody answered, versus answered
    // "other".
    expect(classifyVessel(undefined).typeReported).toBe(false);
    expect(classifyVessel(null).typeReported).toBe(false);
    expect(classifyVessel("OTHER").typeReported).toBe(true);
    expect(classifyVessel("TANKER").typeReported).toBe(true);
  });

  it("draws an unknown vessel without a nose", () => {
    // A pointed silhouette reads as a direction of travel, and an
    // unknown vessel has none we can vouch for.
    expect(classifyVessel(undefined).silhouette).toBe("hull");
  });

  it("only claims support for categories a provider can produce", () => {
    for (const category of SUPPORTED_CATEGORIES) {
      expect(VESSEL_VISUALS[category]).toBeDefined();
    }
    // Declared-but-unreachable families must stay out of the supported
    // list, so the legend marks them unavailable.
    expect(SUPPORTED_CATEGORIES).not.toContain("FISHING");
    expect(SUPPORTED_CATEGORIES).not.toContain("TUG");
  });
});

/* ═══════ Heading ═══════ */

describe("heading resolution", () => {
  it("accepts a reported bearing", () => {
    const h = resolveHeading(137, true);
    expect(h).toEqual({ degrees: 137, known: true, reason: null });
  });

  it("wraps out-of-range bearings rather than discarding them", () => {
    // 370° is an upstream wrapping bug, not an absence of information.
    expect(resolveHeading(370, true).degrees).toBe(10);
    expect(resolveHeading(-90, true).degrees).toBe(270);
    expect(resolveHeading(720, true).degrees).toBe(0);
  });

  it("refuses to treat an unreported course as a bearing", () => {
    // The core case: heading is a required number, so a source with no
    // course still yields 0 — which would draw as due north.
    const h = resolveHeading(0, false);
    expect(h.known).toBe(false);
    expect(h.reason).toMatch(/no course reported/i);
  });

  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("treats %s as no bearing", (_label, value) => {
    expect(resolveHeading(value, true).known).toBe(false);
  });

  it("treats null and undefined as no bearing", () => {
    expect(resolveHeading(null, true).known).toBe(false);
    expect(resolveHeading(undefined, true).known).toBe(false);
  });

  it("assumes reported when the flag is absent", () => {
    // Backwards compatibility: callers predating the flag supplied real
    // courses, so an absent flag must not silently blank them.
    expect(resolveHeading(45, undefined).known).toBe(true);
  });
});

/* ═══════ Rendering ═══════ */

describe("the rendered feature carries the honest state", () => {
  it("marks a known heading and keeps its angle", () => {
    const f = toVesselFeature(
      vessel({
        position: {
          lon: 3.4,
          lat: 6.4,
          heading: 45,
          headingReported: true,
          speed: 10,
          timestamp: new Date().toISOString(),
        },
      }),
    );
    expect(f.properties.headingKnown).toBe(true);
    expect(f.properties.heading).toBe(45);
  });

  it("marks an unreported heading, whatever the filler value", () => {
    const f = toVesselFeature(
      vessel({
        position: {
          lon: 3.4,
          lat: 6.4,
          heading: 0,
          headingReported: false,
          speed: 0,
          timestamp: new Date().toISOString(),
        },
      }),
    );
    expect(f.properties.headingKnown).toBe(false);
  });

  it("carries the category through to the feature", () => {
    const f = toVesselFeature(
      vessel({ identity: { imo: "9074729", name: "TEST_FIXTURE", type: "TANKER" } }),
    );
    expect(f.properties.category).toBe("TANKER");
    expect(f.properties.categoryLabel).toBe("Tanker");
    expect(f.properties.typeReported).toBe(true);
  });

  it("falls back to unspecified when no type was reported", () => {
    const f = toVesselFeature(vessel());
    expect(f.properties.category).toBe("UNKNOWN");
    expect(f.properties.typeReported).toBe(false);
  });
});

describe("sprite selection", () => {
  const withHeading = (reported: boolean, overrides: Partial<Vessel> = {}) =>
    vessel({
      position: {
        lon: 3.4,
        lat: 6.4,
        heading: 90,
        headingReported: reported,
        speed: 8,
        timestamp: new Date().toISOString(),
      },
      ...overrides,
    });

  it("uses the directional sprite when a course is reported", () => {
    expect(vesselIconId(withHeading(true))).toBe("vessel-unknown-hull");
  });

  it("switches to the non-directional sprite when it is not", () => {
    expect(vesselIconId(withHeading(false))).toBe("vessel-unknown-hull-nodir");
  });

  it("keeps the suffix through selection and staleness", () => {
    const v = withHeading(false);
    expect(vesselIconId(v, { selectedImo: v.identity.imo })).toBe("vessel-selected-hull-nodir");
  });

  /*
   * Colour carries type, not risk.
   *
   * It used to carry the risk band, and nothing in this deployment
   * assesses risk — so every vessel resolved to one colour and four
   * hundred ships off Lagos rendered as four hundred identical marks.
   * Colour now encodes the attribute the provider actually reports.
   */
  it("varies both shape and colour by type", () => {
    const tanker = { imo: "9074729", name: "TEST_FIXTURE", type: "TANKER" as const };
    const box = { imo: "9074729", name: "TEST_FIXTURE", type: "CONTAINER" as const };

    expect(vesselIconId(withHeading(true, { identity: tanker, riskLevel: "HIGH" }))).toBe(
      "vessel-tanker-wedge",
    );
    expect(vesselIconId(withHeading(true, { identity: box, riskLevel: "HIGH" }))).toBe(
      "vessel-container-block",
    );
  });

  /*
   * The property that makes the change safe: a risk band no longer moves
   * a hull off its own colour. Recolouring a silhouette to mean danger
   * would also hide what kind of ship is in danger.
   */
  it("never recolours a hull to represent risk", () => {
    const tanker = { imo: "9074729", name: "TEST_FIXTURE", type: "TANKER" as const };

    for (const riskLevel of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "CLEAN", "UNKNOWN"] as const) {
      expect(vesselIconId(withHeading(true, { identity: tanker, riskLevel }))).toBe(
        "vessel-tanker-wedge",
      );
    }
  });

  it("keeps the reported hull type when the bearing is unknown", () => {
    // The mirror of the heading bug: discarding a reported type because
    // the course is missing would throw away real information.
    expect(
      vesselIconId(withHeading(false, { identity: { imo: "9074729", name: "T", type: "TANKER" } })),
    ).toBe("vessel-tanker-wedge-nodir");
  });
});

/* ═══════ Sprite registration ═══════ */

describe("every sprite a vessel can ask for is registered", () => {
  it("composes ids through the one shared function", () => {
    expect(vesselSpriteId("critical", "wedge", true)).toBe("vessel-critical-wedge");
    expect(vesselSpriteId("critical", "wedge", false)).toBe("vessel-critical-wedge-nodir");
  });

  it("enumerates the full colour × silhouette × direction product", () => {
    const ids = vesselSpriteIds();
    expect(ids.length).toBe(VESSEL_COLOR_KEYS.length * VESSEL_SILHOUETTES.length * 2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /*
   * The regression guard for the defect this sprint fixed.
   *
   * The renderer binds `icon-image` to the feature's `iconId` and
   * registers exactly `vesselSpriteIds()`. If `vesselIconId` can ever
   * produce an id outside that set, MapLibre silently draws nothing —
   * a vessel that vanishes rather than errors.
   */
  it("covers every id vesselIconId can produce", () => {
    const registered = new Set(vesselSpriteIds());
    const risks = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "CLEAN", "UNKNOWN"] as const;
    const types = [undefined, "CONTAINER", "TANKER", "BULK", "VEHICLE", "OTHER"] as const;
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    for (const risk of risks) {
      for (const type of types) {
        for (const reported of [true, false]) {
          for (const isStale of [true, false]) {
            for (const selected of [true, false]) {
              const v = vessel({
                identity: { imo: "9074729", name: "TEST_FIXTURE", ...(type ? { type } : {}) },
                riskLevel: risk,
                position: {
                  lon: 3.4,
                  lat: 6.4,
                  heading: 90,
                  headingReported: reported,
                  speed: 8,
                  timestamp: isStale ? stale : new Date().toISOString(),
                },
              });
              const id = vesselIconId(v, selected ? { selectedImo: v.identity.imo } : {});
              expect(registered, `unregistered sprite: ${id}`).toContain(id);
            }
          }
        }
      }
    }
  });

  it("never gives a pointed sprite to a vessel with no reported course", () => {
    // Rotation is only half the guarantee. An unrotated *pointed* hull
    // still points north, so the sprite itself must be blunt.
    for (const type of [undefined, "CONTAINER", "TANKER", "BULK", "VEHICLE"] as const) {
      const v = vessel({
        identity: { imo: "9074729", name: "TEST_FIXTURE", ...(type ? { type } : {}) },
        position: {
          lon: 3.4,
          lat: 6.4,
          heading: 0,
          headingReported: false,
          speed: 0,
          timestamp: new Date().toISOString(),
        },
      });
      expect(vesselIconId(v)).toMatch(/-nodir$/);
    }
  });
});
