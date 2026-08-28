/**
 * What the vessel drawer is allowed to say.
 *
 * The panel's failure mode is not a crash — it is a confident sentence
 * about something nobody checked. These tests hold the line between the
 * three silences an officer must be able to tell apart: no source
 * exists, a source exists but has not assessed this vessel, and a source
 * answered with nothing.
 */
import { describe, expect, it } from "vitest";

import { presentVessel } from "@/features/maritime/vessel-presentation";
import type { Vessel } from "@/services/geospatial";

const vessel = (overrides: Partial<Vessel> = {}): Vessel =>
  ({
    identity: { imo: "SIM-0001", name: "Opobo Pioneer", mmsi: "111", type: "CARGO" },
    position: {
      lat: 6.4272,
      lon: 3.2578,
      heading: 0,
      speed: 0,
      timestamp: new Date().toISOString(),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    ...overrides,
  }) as Vessel;

describe("absence is explained, never collapsed into one word", () => {
  it("distinguishes an unconnected source from an empty report", () => {
    /*
     * Both fields are blank on screen, and they mean opposite things.
     * Ownership is missing for every vessel because nothing resolves it;
     * a call sign is missing because this particular report omitted one.
     * "Unknown" for both would tell an officer the system checked
     * ownership, which it never did.
     */
    const p = presentVessel(vessel());

    const owner = p.ownership.find((d) => d.label === "Registered owner")!;
    expect(owner.availability).toBe("NOT_CONNECTED");
    expect(owner.reason).toMatch(/no entity intelligence source is connected/i);

    const callSign = p.identity.find((d) => d.label === "Call sign")!;
    expect(callSign.availability).toBe("UNAVAILABLE");
    expect(callSign.reason).toMatch(/position report/i);
  });

  it("gives every unavailable field a reason", () => {
    const p = presentVessel(vessel());
    const all = [...p.identity, ...p.snapshot, ...p.voyage, ...p.ownership, ...p.people];
    for (const datum of all) {
      if (datum.availability === "AVAILABLE") {
        expect(datum.value, datum.label).toBeTruthy();
      } else {
        // A blank field with no explanation reads as "not loaded".
        expect(datum.reason, `${datum.label} has no reason`).toBeTruthy();
      }
    }
  });
});

describe("it does not invent a voyage", () => {
  it("never claims an origin", () => {
    /*
     * A track's earliest point is where recording started, not where the
     * voyage began. Naming it an origin port invents a leg nobody saw.
     */
    const origin = presentVessel(vessel()).voyage.find((d) => d.label === "Origin")!;
    expect(origin.availability).toBe("NOT_CONNECTED");
    expect(origin.value).toBeUndefined();
  });

  it("prints a declared destination verbatim and geocodes nothing", () => {
    const withDest = vessel({
      position: { ...vessel().position, destination: "NGAPP" },
    } as Partial<Vessel>);
    const datum = presentVessel(withDest).voyage.find((d) => d.label === "Declared destination")!;
    expect(datum.value).toBe("NGAPP");
    expect(datum.provenance).toMatch(/as declared/i);
  });
});

describe("an unreported course is not a northerly heading", () => {
  it("reports absence rather than 0°", () => {
    /*
     * `heading` is a required number, so a source with no course yields
     * 0 — indistinguishable on screen from genuinely steaming north.
     */
    const silent = vessel({
      position: { ...vessel().position, headingReported: false },
    } as Partial<Vessel>);
    const datum = presentVessel(silent).snapshot.find((d) => d.label === "Heading")!;
    expect(datum.availability).toBe("UNAVAILABLE");
    expect(datum.value).toBeUndefined();
  });
});

describe("the three assessment axes stay apart", () => {
  it("reports unassessed risk as not assessed, never as a band", () => {
    const { risk, unresolved } = presentVessel(vessel()).assessment;
    expect(risk.availability).toBe("NOT_ASSESSED");
    expect(risk.value).toBeUndefined();
    // The specific falsehood this guards: UNKNOWN presented as safe.
    expect(risk.reason).not.toMatch(/\blow\b/i);
    expect(unresolved).toBe(true);
  });

  it("treats a zero attention score as unranked, not as low priority", () => {
    const { attention } = presentVessel(vessel()).assessment;
    expect(attention.availability).toBe("NOT_ASSESSED");
    expect(attention.value).toBeUndefined();
  });

  it("surfaces a genuine risk band when one is assigned", () => {
    const assessed = presentVessel(vessel({ riskLevel: "HIGH" }));
    expect(assessed.assessment.risk.availability).toBe("AVAILABLE");
    expect(assessed.assessment.unresolved).toBe(false);
  });
});

describe("crew is people, and a count is not people", () => {
  it("reports no crew intelligence rather than an empty roster", () => {
    const people = presentVessel(vessel()).people;
    for (const datum of people) {
      expect(datum.availability).toBe("NOT_CONNECTED");
      expect(datum.reason).toMatch(/crew intelligence source is connected/i);
    }
    // No fabricated person reaches the presentation at all.
    expect(people.some((d) => d.value)).toBe(false);
  });
});

describe("activity is only what was actually recorded", () => {
  it("carries the position report and invents no case history", () => {
    const activity = presentVessel(vessel()).activity;
    expect(activity).toHaveLength(1);
    expect(activity[0].summary).toMatch(/position report/i);
    expect(activity[0].provenance).toBeTruthy();
  });
});
