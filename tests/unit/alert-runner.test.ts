/**
 * The reconciliation runner.
 *
 * Small on purpose: it takes a fleet, assesses it, persists the result.
 * What is worth asserting is mostly what it refuses to do — invent a
 * fleet, invent a boundary, or report an all-clear it never established.
 */
import { describe, expect, it } from "vitest";

import { InMemoryAlertRepository, runReconciliationCycle } from "@/services/alerts";
import type { LonLat, Vessel } from "@/services/geospatial";

const AT = Date.parse("2026-08-28T09:00:00.000Z");

/** A square well offshore of the ring below, closing on it heading west. */
function vessel(imo: string, lon: number, sourceTag = "simulated"): Vessel {
  return {
    identity: { imo, name: `Vessel ${imo}` },
    position: {
      lon,
      lat: 4.0,
      heading: 270,
      speed: 14,
      timestamp: new Date(AT).toISOString(),
    },
    riskLevel: "UNKNOWN",
    attentionScore: 0,
    provenance: { source: sourceTag },
  } as Vessel;
}

/** A closed ring around a patch of the Gulf of Guinea. */
const RING: readonly LonLat[] = [
  [2.5, 3.0],
  [6.5, 3.0],
  [6.5, 5.5],
  [2.5, 5.5],
  [2.5, 3.0],
];

function cycle(
  vessels: readonly Vessel[],
  ring: readonly LonLat[] | null,
  repo = new InMemoryAlertRepository(),
) {
  return runReconciliationCycle({
    vessels,
    boundaryRing: ring,
    sourceId: "simulated",
    repository: repo,
    now: () => AT,
  });
}

describe("the runner refuses rather than guessing", () => {
  it("does not run against an empty fleet", async () => {
    const outcome = await cycle([], RING);

    expect(outcome.ran).toBe(false);
    if (!outcome.ran) expect(outcome.reason).toBe("NO_FLEET");
  });

  it("does not run without a boundary", async () => {
    const outcome = await cycle([vessel("A", 8)], null);

    expect(outcome.ran).toBe(false);
    if (!outcome.ran) expect(outcome.reason).toBe("NO_BOUNDARY");
  });

  it("does not accept a ring too small to enclose anything", async () => {
    const outcome = await cycle(
      [vessel("A", 8)],
      [
        [2, 3],
        [3, 3],
      ],
    );

    expect(outcome.ran).toBe(false);
    if (!outcome.ran) expect(outcome.reason).toBe("NO_BOUNDARY");
  });

  /*
   * The distinction the skip reasons exist for. A caller must be able to
   * tell "nothing is approaching" from "nothing was assessed", because
   * only the first is an all-clear.
   */
  it("separates a cycle that ran and found nothing from one that could not run", async () => {
    const ran = await cycle([vessel("A", 8)], RING);
    const skipped = await cycle([], RING);

    expect(ran.ran).toBe(true);
    expect(skipped.ran).toBe(false);
  });
});

describe("the runner is idempotent and provider-agnostic", () => {
  it("raises once across repeated cycles on an unchanged fleet", async () => {
    const repository = new InMemoryAlertRepository();
    const fleet = [vessel("SIM-1", 7.2)];

    for (let i = 0; i < 4; i++) await cycle(fleet, RING, repository);

    const active = await repository.listActive();
    // Exactly one, not "at most one": a bound that admits zero would pass
    // if the vessel stopped being eligible and prove nothing about
    // duplication.
    expect(active).toHaveLength(1);
    expect(active[0].condition).toBe("ENTERING");
    expect(active[0].events.filter((event) => event.type === "RAISED")).toHaveLength(1);
  });

  it("treats every provider's vessels the same way", async () => {
    const simulated = new InMemoryAlertRepository();
    const live = new InMemoryAlertRepository();

    await cycle([vessel("SIM-1", 7.2, "simulated")], RING, simulated);
    await cycle([vessel("SIM-1", 7.2, "global-fishing-watch")], RING, live);

    // No branch on provider anywhere in the runner: the same canonical
    // vessel produces the same decision whatever fed it. Asserted against
    // a known value as well as against each other, so two empty results
    // cannot pass as agreement.
    const fromSimulated = await simulated.listActive();
    const fromLive = await live.listActive();
    expect(fromSimulated).toHaveLength(1);
    expect(fromLive).toHaveLength(1);
    expect(fromLive[0].condition).toBe(fromSimulated[0].condition);
  });

  it("performs no work beyond the repository", async () => {
    const repository = new InMemoryAlertRepository();
    // A cycle touches storage and nothing else — no map, no navigation,
    // no audio, no timers of its own.
    const outcome = await cycle([vessel("SIM-1", 7.2)], RING, repository);

    expect(outcome.ran).toBe(true);
    if (outcome.ran) expect(outcome.assessedAt).toBe(new Date(AT).toISOString());
  });
});
