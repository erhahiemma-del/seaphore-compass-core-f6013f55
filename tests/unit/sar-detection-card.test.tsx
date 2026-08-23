// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SarDetectionCard } from "@/components/intelligence/SarDetectionCard";
import {
  classifyDetection,
  correlateDetection,
  findAisGaps,
  type AisReport,
  type SarDetection,
} from "@/services/eo";

afterEach(() => cleanup());

const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const ACQUIRED = "2026-08-20T06:00:00.000Z";

function detection(over: Partial<SarDetection> = {}): SarDetection {
  return {
    id: "det-1",
    sceneId: "S1A_IW_GRDH_001",
    sensor: "sentinel-1",
    acquiredAt: ACQUIRED,
    position: { latitude: 6.4, longitude: 3.4 },
    positionUncertaintyM: 100,
    estimatedLengthM: 180,
    estimatedWidthM: 28,
    estimatedHeadingDeg: 90,
    radarCrossSectionDb: 24,
    detectionConfidence: 0.9,
    detector: {
      serviceId: "test-service",
      modelId: "cfar-v1",
      modelVersion: "1.0.0",
      processedAt: ACQUIRED,
    },
    ...over,
  };
}

function ais(over: Partial<AisReport> = {}): AisReport {
  return {
    mmsi: "657123400",
    imo: "9438291",
    name: "MV Test",
    reportedAt: ACQUIRED,
    latitude: 6.4,
    longitude: 3.4,
    speedKnots: 12,
    courseDeg: 90,
    lengthM: 180,
    source: "datalastic",
    ...over,
  };
}

function eventFor(reports: readonly AisReport[], det = detection()) {
  const correlation = correlateDetection(det, reports, { now: NOW });
  return classifyDetection(det, correlation, [], { now: NOW });
}

describe("SarDetectionCard", () => {
  it("shows the sensor, acquisition time and age together", () => {
    render(<SarDetectionCard event={eventFor([ais()])} now={NOW} />);

    expect(screen.getByText(/sentinel-1/)).toBeInTheDocument();
    expect(screen.getByText("2026-08-20 06:00Z")).toBeInTheDocument();
    // Age appears in the header, qualifying everything else on the card.
    expect(screen.getAllByText(/6 h old/).length).toBeGreaterThan(0);
  });

  it("says the position is a snapshot, not a live position", () => {
    render(<SarDetectionCard event={eventFor([ais()])} now={NOW} />);
    expect(screen.getByText(/snapshot at acquisition, not a live position/)).toBeInTheDocument();
  });

  it("shows detection confidence separately from correlation confidence", () => {
    // "Is this an object at all?" and "is it that vessel?" are different
    // questions and must never share a number.
    render(<SarDetectionCard event={eventFor([ais()])} now={NOW} />);

    expect(screen.getByText("Detection confidence")).toBeInTheDocument();
    expect(screen.getAllByText(/correlation confidence/).length).toBeGreaterThan(0);
  });

  it("presents identity as ranked hypotheses, never as an identification", () => {
    render(<SarDetectionCard event={eventFor([ais()])} now={NOW} />);

    expect(screen.getByText(/Ranked hypotheses, not identifications/)).toBeInTheDocument();
    expect(screen.getByText(/carries no name, IMO or MMSI/)).toBeInTheDocument();
  });

  it("shows the evidence behind a candidate, including what argued against", () => {
    const event = eventFor([ais({ lengthM: 300 })], detection({ estimatedLengthM: 60 }));
    render(<SarDetectionCard event={event} now={NOW} />);

    expect(screen.getByText(/conflicts with AIS/)).toBeInTheDocument();
    expect(screen.getByText("-0.40")).toBeInTheDocument();
  });

  it("flags a dead-reckoned AIS position rather than presenting it as reported", () => {
    const event = eventFor([ais({ reportedAt: "2026-08-20T05:40:00.000Z", longitude: 3.3331 })]);
    render(<SarDetectionCard event={event} now={NOW} />);

    expect(screen.getByText(/dead-reckoned to the acquisition time/)).toBeInTheDocument();
  });

  it("states no-AIS-coverage as a collection gap, not a finding", () => {
    render(<SarDetectionCard event={eventFor([])} now={NOW} />);

    expect(screen.getByText("No AIS coverage")).toBeInTheDocument();
    expect(
      screen.getByText(/gap in collection, not an observation about the vessel/),
    ).toBeInTheDocument();
  });

  it("renders the heading with its unresolved 180° ambiguity", () => {
    render(<SarDetectionCard event={eventFor([ais()])} now={NOW} />);
    expect(screen.getByText("90° ±180°")).toBeInTheDocument();
  });

  it("names what would strengthen an event that stopped short", () => {
    render(<SarDetectionCard event={eventFor([])} now={NOW} />);
    expect(screen.getByText(/What would strengthen this/)).toBeInTheDocument();
  });

  it("shows the gap details on a dark contact", () => {
    const gaps = findAisGaps(
      [
        ais({ reportedAt: "2026-08-20T02:00:00.000Z" }),
        ais({ reportedAt: "2026-08-20T10:00:00.000Z", latitude: 6.5, longitude: 3.5 }),
      ],
      { now: NOW },
    );
    const far = [ais({ mmsi: "other", latitude: 20, longitude: 30 })];
    const correlation = correlateDetection(detection(), far, { now: NOW });
    const event = classifyDetection(detection(), correlation, gaps, { now: NOW });

    render(<SarDetectionCard event={event} now={NOW} />);

    expect(screen.getByText("High-Confidence Dark Contact")).toBeInTheDocument();
    expect(screen.getByText("Gap vessel")).toBeInTheDocument();
    expect(screen.getByText("datalastic")).toBeInTheDocument();
  });

  it("attributes the detection to its model", () => {
    render(<SarDetectionCard event={eventFor([ais()])} now={NOW} />);
    expect(screen.getByText("cfar-v1 v1.0.0")).toBeInTheDocument();
  });
});
