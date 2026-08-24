import { describe, expect, it } from "vitest";

import {
  buildNationalPicture,
  describeMetric,
  metricFreshness,
  pictureCoverage,
  type NationalPictureInputs,
  type Vessel,
} from "@/services/geospatial";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");

/** TEST_FIXTURE */
function vessel(over: Partial<Vessel> = {}): Vessel {
  return {
    identity: { imo: "9074729", mmsi: "657123400", name: "TEST_FIXTURE MV ABC", flag: "NG" },
    position: {
      lon: 3.4,
      lat: 6.4,
      heading: 90,
      speed: 12,
      timestamp: new Date(NOW - 60_000).toISOString(),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    provenance: {
      source: "global-fishing-watch",
      provider: "Global Fishing Watch",
      retrievedAt: new Date(NOW).toISOString(),
      observedAt: new Date(NOW - 60_000).toISOString(),
    },
    ...over,
  } as Vessel;
}

function inputs(over: Partial<NationalPictureInputs> = {}): NationalPictureInputs {
  return { vessels: [], vesselSourceConnected: false, now: NOW, ...over };
}

/* ────────── the distinction the screen exists to protect ────────── */

describe("zero is not the same as pending", () => {
  it("reports pending, never 0, when no vessel provider is connected", () => {
    // An officer reading "0 vessels" concludes the water is empty. The
    // truth is that nothing was examined.
    const picture = buildNationalPicture(inputs());

    expect(picture.vessels.kind).toBe("pending");
    expect(describeMetric(picture.vessels)).toBe("Data source pending");
    expect(describeMetric(picture.vessels)).not.toBe("0");
  });

  it("reports a real zero when a connected provider found nothing", () => {
    const picture = buildNationalPicture(inputs({ vesselSourceConnected: true, vessels: [] }));

    expect(picture.vessels.kind).toBe("available");
    expect(describeMetric(picture.vessels)).toBe("0");
  });

  it("gives every pending metric a reason and a requirement", () => {
    const picture = buildNationalPicture(inputs());
    const metrics = [
      picture.vessels,
      picture.arrivals,
      picture.departures,
      picture.aisGaps,
      picture.sarObservations,
      picture.environmentalEvents,
    ];

    for (const metric of metrics) {
      expect(metric.kind).toBe("pending");
      if (metric.kind !== "pending") continue;
      expect(metric.reason.length).toBeGreaterThan(20);
      expect(metric.requires.length).toBeGreaterThan(5);
    }
  });

  it("never phrases a pending metric as an absence of objects", () => {
    const picture = buildNationalPicture(inputs());
    if (picture.aisGaps.kind !== "pending") throw new Error("expected pending");

    expect(picture.aisGaps.reason).toMatch(/not a statement that no vessel has gone dark/i);
  });
});

/* ───────────────── capability-gated metrics ────────────────── */

describe("metrics gated on provider capability", () => {
  it("cannot count anchored vessels when no provider reports speed", () => {
    // GFW publishes no speed. The model always carries one, so a fleet
    // that looks stopped is indistinguishable from a fleet with no speed
    // data — the capability must be declared, never inferred from zeros.
    const picture = buildNationalPicture(
      inputs({
        vesselSourceConnected: true,
        providerReportsSpeed: false,
        vessels: [vessel({ position: { ...vessel().position, speed: 0 } })],
      }),
    );

    expect(picture.anchored.kind).toBe("pending");
    if (picture.anchored.kind !== "pending") return;
    expect(picture.anchored.reason).toMatch(/Global Fishing Watch publishes no speed/);
  });

  it("counts anchored vessels once a provider reports speed", () => {
    const picture = buildNationalPicture(
      inputs({
        vesselSourceConnected: true,
        providerReportsSpeed: true,
        vessels: [
          vessel({ position: { ...vessel().position, speed: 0 } }),
          vessel({ position: { ...vessel().position, speed: 12 } }),
        ],
      }),
    );

    expect(picture.anchored.kind).toBe("available");
    if (picture.anchored.kind !== "available") return;
    expect(picture.anchored.value).toBe(1);
  });

  it("cannot count high risk when nothing has been assessed", () => {
    // Every vessel UNKNOWN means unassessed, not clean.
    const picture = buildNationalPicture(
      inputs({ vesselSourceConnected: true, vessels: [vessel(), vessel()] }),
    );

    expect(picture.highRisk.kind).toBe("pending");
    if (picture.highRisk.kind !== "pending") return;
    expect(picture.highRisk.reason).toMatch(/cannot be established/);
  });

  it("counts high risk once OSAE has assessed the fleet", () => {
    const picture = buildNationalPicture(
      inputs({
        vesselSourceConnected: true,
        vessels: [vessel({ riskLevel: "HIGH" }), vessel({ riskLevel: "LOW" })],
      }),
    );

    expect(picture.highRisk.kind).toBe("available");
    if (picture.highRisk.kind !== "available") return;
    expect(picture.highRisk.value).toBe(1);
  });
});

/* ──────────────────── source attribution ───────────────────── */

describe("attribution and freshness", () => {
  it("attributes a count to the providers behind it", () => {
    const picture = buildNationalPicture(
      inputs({ vesselSourceConnected: true, vessels: [vessel()] }),
    );

    expect(picture.vessels.kind).toBe("available");
    if (picture.vessels.kind !== "available") return;
    expect(picture.vessels.sources).toEqual(["global-fishing-watch"]);
    expect(picture.contributingSources).toContain("global-fishing-watch");
  });

  it("labels an unattributed observation rather than dropping it", () => {
    const picture = buildNationalPicture(
      inputs({
        vesselSourceConnected: true,
        vessels: [vessel({ provenance: undefined })],
      }),
    );

    if (picture.vessels.kind !== "available") throw new Error("expected available");
    expect(picture.vessels.sources).toEqual(["unattributed"]);
    expect(picture.vessels.value).toBe(1);
  });

  it("derives freshness from the newest observation", () => {
    const picture = buildNationalPicture(
      inputs({ vesselSourceConnected: true, vessels: [vessel()] }),
    );

    expect(metricFreshness(picture.vessels)).toBe("fresh");
  });

  it("has no freshness for a pending metric", () => {
    expect(metricFreshness(buildNationalPicture(inputs()).vessels)).toBeNull();
  });

  it("reports no contributing sources when the picture is entirely pending", () => {
    expect(buildNationalPicture(inputs()).contributingSources).toEqual([]);
  });
});

/* ─────────────────────── coverage ──────────────────────────── */

describe("picture coverage", () => {
  it("counts investigations as always answerable — they are ours", () => {
    const picture = buildNationalPicture(inputs({ activeInvestigations: 3 }));

    expect(picture.activeInvestigations.kind).toBe("available");
    if (picture.activeInvestigations.kind !== "available") return;
    expect(picture.activeInvestigations.value).toBe(3);
  });

  it("reports how much of the picture can be answered today", () => {
    const coverage = pictureCoverage(buildNationalPicture(inputs()));

    expect(coverage.total).toBe(9);
    // Only investigations are answerable with nothing connected.
    expect(coverage.available).toBe(1);
    expect(coverage.pending).toBe(8);
  });

  it("improves as sources connect", () => {
    const withGfw = pictureCoverage(
      buildNationalPicture(
        inputs({ vesselSourceConnected: true, providerReportsSpeed: true, vessels: [vessel()] }),
      ),
    );

    expect(withGfw.available).toBeGreaterThan(1);
  });

  it("counts SAR and environment once their sources connect", () => {
    const picture = buildNationalPicture(
      inputs({
        sarDetections: { count: 2, acquiredAt: new Date(NOW - 6 * 3_600_000).toISOString() },
        environmentalEvents: { count: 5, sources: ["nosdra"] },
      }),
    );

    expect(picture.sarObservations.kind).toBe("available");
    expect(picture.environmentalEvents.kind).toBe("available");
    if (picture.sarObservations.kind !== "available") return;
    // SAR carries its acquisition age — never presented as live.
    expect(picture.sarObservations.ageMs).toBe(6 * 3_600_000);
  });

  it("counts arrivals and departures once NPA connects", () => {
    const picture = buildNationalPicture(
      inputs({ portCalls: { arrivals: 7, departures: 4, sources: ["npa-shippos"] } }),
    );

    expect(describeMetric(picture.arrivals)).toBe("7");
    expect(describeMetric(picture.departures)).toBe("4");
    expect(picture.contributingSources).toContain("npa-shippos");
  });
});
