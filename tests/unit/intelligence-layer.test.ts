/**
 * The seam between the Copilot and whoever answers it.
 *
 * The Copilot asks for ownership. It must not know that ownership will
 * one day come from a registry, or that today nothing can answer. This
 * holds the two properties that make that safe: an unanswerable question
 * says so with a reason, and the reason distinguishes "no provider
 * exists" from "a provider looked and found nothing".
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  capabilityMatrix,
  describeCapability,
  getApproachingVessels,
  getCompanyProfile,
  getVessel,
  getVesselCargo,
  getVesselCompliance,
  getVesselCrew,
  getVesselOwnership,
  getVesselVoyage,
  isConnected,
  registerCapability,
  registerConnectedProviders,
  resetCapabilities,
} from "@/services/intelligence-layer";
import { registerSimulatedVesselSource } from "@/services/geospatial/sources/simulated-vessel-source";
import type { Vessel } from "@/services/geospatial";

beforeEach(() => resetCapabilities());

describe("an unanswerable question says why", () => {
  it.each([
    ["ownership", () => getVesselOwnership("IMO-1")],
    ["crew", () => getVesselCrew("IMO-1")],
    ["voyage", () => getVesselVoyage("IMO-1")],
    ["cargo", () => getVesselCargo("IMO-1")],
    ["compliance", () => getVesselCompliance("IMO-1")],
    ["company", () => getCompanyProfile("Acme")],
  ])("%s reports no provider rather than an empty answer", (_label, ask) => {
    const answer = ask();
    expect(answer.availability).toBe("NOT_CONNECTED");
    expect(answer.value).toBeUndefined();
    /*
     * The distinction that matters: an empty list would tell an officer
     * the system checked and found nothing. It never checked.
     */
    expect(answer.reason).toMatch(/no provider is connected/i);
  });

  it("never invents an approach assessment", () => {
    const answer = getApproachingVessels({ region: "Nigeria", withinHours: 24 });
    expect(answer.availability).toBe("NOT_CONNECTED");
    expect(answer.value).toBeUndefined();
    // Distance alone is computable; an arrival window is not.
    expect(answer.reason).toMatch(/course held over time|arrival window/i);
  });
});

describe("what the deployment can actually answer", () => {
  it("claims nothing for a registered provider that is not enabled", () => {
    /*
     * The defect this replaced: capabilities were taken from
     * `sources[0]`. Global Fishing Watch registers ahead of the
     * simulation and has no API key here, so the layer announced live
     * positions from a provider that cannot answer.
     */
    registerSimulatedVesselSource({ timeScale: 1 });
    registerConnectedProviders([]);
    expect(isConnected("vessel.positions")).toBe(false);
  });

  it("claims nothing before providers register", () => {
    expect(isConnected("vessel.positions")).toBe(false);
    expect(capabilityMatrix().every((row) => !row.connected)).toBe(true);
  });

  it("claims only positions, identity and track once a source is connected", () => {
    registerSimulatedVesselSource({ timeScale: 1 });
    /*
     * Declared from the *enabled* sources, not the registered ones. A
     * provider with an adapter and no credentials is registered and
     * cannot answer, and claiming it would have the Copilot announce
     * positions nothing can supply.
     */
    registerConnectedProviders(["simulated"]);

    const connected = capabilityMatrix()
      .filter((row) => row.connected)
      .map((row) => row.capability);

    expect(connected).toEqual(["vessel.positions", "vessel.identity", "vessel.track"]);
    /*
     * Ownership is a property of a vessel, and the vessel feed is
     * connected — but the feed does not carry it. Claiming the
     * capability because the subject is connected is exactly the
     * over-claim this layer exists to prevent.
     */
    expect(isConnected("vessel.ownership")).toBe(false);
  });

  it("describes every capability in words an officer can read", () => {
    for (const row of capabilityMatrix()) {
      expect(describeCapability(row.capability)).toBeTruthy();
      expect(row.description).not.toMatch(/[._]/);
    }
  });
});

describe("answers carry who produced them", () => {
  const fleet = [
    { identity: { imo: "SIM-0001", name: "Opobo Pioneer" } },
  ] as unknown as readonly Vessel[];

  it("labels a simulated provider as simulated, never observed", () => {
    registerSimulatedVesselSource({ timeScale: 1 });
    registerCapability("vessel.positions", {
      id: "simulated",
      label: "Simulated",
      capabilities: ["vessel.positions"],
    });

    const answer = getVessel("SIM-0001", fleet);
    expect(answer.availability).toBe("AVAILABLE");
    /*
     * A simulated provider observes nothing. Calling it OBSERVED here
     * would launder generated positions into observations one layer
     * below where anybody would think to look.
     */
    expect(answer.provenance?.kind).toBe("SIMULATED");
  });

  it("separates a missing record from a missing provider", () => {
    registerSimulatedVesselSource({ timeScale: 1 });
    registerConnectedProviders(["simulated"]);

    const answer = getVessel("SIM-9999", fleet);
    expect(answer.availability).toBe("NO_RECORD");
    expect(answer.reason).toMatch(/is held by the connected source/i);
    // A provider answered, so the answer still says who.
    expect(answer.provenance).toBeDefined();
  });
});
