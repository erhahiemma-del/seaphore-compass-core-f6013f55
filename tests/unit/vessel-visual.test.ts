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
  VESSEL_VISUALS,
  classifyVessel,
  resolveHeading,
  toVesselFeature,
  vesselIconId,
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
    expect(classifyVessel(undefined).silhouette).toBe("disc");
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
  const withHeading = (reported: boolean) =>
    vessel({
      position: {
        lon: 3.4,
        lat: 6.4,
        heading: 90,
        headingReported: reported,
        speed: 8,
        timestamp: new Date().toISOString(),
      },
    });

  it("uses the directional sprite when a course is reported", () => {
    expect(vesselIconId(withHeading(true))).toBe("vessel-unknown");
  });

  it("switches to the non-directional sprite when it is not", () => {
    expect(vesselIconId(withHeading(false))).toBe("vessel-unknown-nodir");
  });

  it("keeps the suffix through selection and staleness", () => {
    const v = withHeading(false);
    expect(vesselIconId(v, { selectedImo: v.identity.imo })).toBe("vessel-selected-nodir");
  });
});
