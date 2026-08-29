/**
 * Arrival evidence — the arithmetic, and the conclusion it must not draw.
 *
 * These lock two things. The comparison is correct, and it stays evidence:
 * nothing here may decide that a vessel past its declared ETA is late.
 * Crews leave stale ETAs broadcasting for days, a vessel waiting for a
 * berth is behaving normally, and an ETA to another port is not late at
 * all — so the judgement needs a validated rule, and until there is one an
 * alert raised from this would be a guess wearing an alert's authority.
 */
import { describe, expect, it } from "vitest";

import { arrivalEvidence } from "@/services/geospatial/arrival-evidence";
import type { DeclaredVoyage } from "@/services/geospatial/vessel-enrichment";

/** The real live case: declared 24 Aug, still observed off Lagos on 29 Aug. */
const OVERDUE: DeclaredVoyage = {
  departurePort: "KAMSAR",
  departureUnlocode: "GNKMR",
  departedAt: "2026-07-27T13:18:00.000Z",
  destinationText: "LAGOS",
  destinationLink: {
    state: "VERIFIED",
    unlocode: "NGLOS",
    providerPortUuid: "2cb375dd-aea5-fc12-a639-7c15b893e250",
    name: "LAGOS",
    note: null,
  },
  eta: "2026-08-24T09:13:00.000Z",
  navigationStatus: "Restricted manoeuverability",
  currentDraught: 3.8,
  observedAt: "2026-08-29T14:41:00.000Z",
};

describe("the comparison", () => {
  it("sees an observation later than the declared ETA", () => {
    const evidence = arrivalEvidence(OVERDUE);

    expect(evidence.timing).toBe("PAST_DECLARED_ETA");
    // Five days and change, in milliseconds.
    expect(evidence.deltaMs).toBeGreaterThan(5 * 24 * 60 * 60_000);
  });

  it("sees an observation before the declared ETA", () => {
    const evidence = arrivalEvidence({ ...OVERDUE, observedAt: "2026-08-20T00:00:00.000Z" });

    expect(evidence.timing).toBe("BEFORE_DECLARED_ETA");
    expect(evidence.deltaMs).toBeLessThan(0);
  });

  /*
   * A missing time must not become a zero-hour difference, and must not
   * become the epoch — which would make every voyage catastrophically
   * overdue and would be the most confidently wrong output available.
   */
  it("refuses to compare when the ETA is missing", () => {
    const evidence = arrivalEvidence({ ...OVERDUE, eta: null });

    expect(evidence.timing).toBe("NOT_COMPARABLE");
    expect(evidence.deltaMs).toBeNull();
  });

  it("refuses to compare when the observation time is missing", () => {
    const evidence = arrivalEvidence({ ...OVERDUE, observedAt: null });

    expect(evidence.timing).toBe("NOT_COMPARABLE");
    expect(evidence.deltaMs).toBeNull();
  });

  it("refuses to compare an unparseable time rather than treating it as zero", () => {
    const evidence = arrivalEvidence({ ...OVERDUE, eta: "not a date" });

    expect(evidence.timing).toBe("NOT_COMPARABLE");
    expect(evidence.deltaMs).toBeNull();
  });

  it("handles a vessel with no voyage at all", () => {
    const evidence = arrivalEvidence(null);

    expect(evidence.timing).toBe("NOT_COMPARABLE");
    expect(evidence.declaredEta).toBeNull();
  });
});

describe("the context a later rule will need", () => {
  it("carries navigation status and draught alongside the timing", () => {
    const evidence = arrivalEvidence(OVERDUE);

    expect(evidence.navigationStatus).toBe("Restricted manoeuverability");
    expect(evidence.currentDraught).toBe(3.8);
  });

  /*
   * "Past ETA" for an unresolved destination is a far weaker signal — the
   * ETA may belong to a voyage leg Seaphore cannot see — so a rule has to
   * be able to tell the two apart.
   */
  it("says whether the destination resolved to a real port", () => {
    expect(arrivalEvidence(OVERDUE).destinationResolved).toBe(true);
    expect(arrivalEvidence(OVERDUE).destinationUnlocode).toBe("NGLOS");

    const unresolved = arrivalEvidence({
      ...OVERDUE,
      destinationLink: {
        state: "NO_VERIFIED_PORT_LINK",
        unlocode: null,
        providerPortUuid: null,
        name: "LAGOS",
        note: "unresolved",
      },
    });

    expect(unresolved.destinationResolved).toBe(false);
    // Still comparable — the timing is knowable, its meaning is not.
    expect(unresolved.timing).toBe("PAST_DECLARED_ETA");
  });

  it("preserves the provider's ETA rather than restating it", () => {
    expect(arrivalEvidence(OVERDUE).declaredEta).toBe("2026-08-24T09:13:00.000Z");
    expect(arrivalEvidence(OVERDUE).observedAt).toBe("2026-08-29T14:41:00.000Z");
  });
});

/*
 * The boundary this module exists to hold.
 *
 * Read as a contract rather than a style check: an alert raised from this
 * evidence, before a rule has been validated against real Nigerian port
 * behaviour, would present a guess with an alert's authority.
 */
describe("evidence, not a finding", () => {
  it("names no severity, risk or violation", () => {
    const evidence = arrivalEvidence(OVERDUE) as unknown as Record<string, unknown>;

    for (const forbidden of ["severity", "risk", "alert", "violation", "anomaly", "late"]) {
      expect(Object.keys(evidence)).not.toContain(forbidden);
    }
  });

  it("describes the clock, not the vessel's conduct", () => {
    // "PAST_DECLARED_ETA" is a statement about time. "OVERDUE" or "LATE"
    // would be a statement about the vessel, which needs a rule.
    expect(arrivalEvidence(OVERDUE).timing).toBe("PAST_DECLARED_ETA");
  });
});
