/**
 * The cost governor.
 *
 * Written after an allowance was exhausted in about thirteen minutes of
 * the map being open, so these are regression tests for a real incident
 * rather than defensive hypotheticals. The rules they lock are the three
 * that mattered: a 402 must stop paid requests entirely, a 429 must not,
 * and a blocked provider must cost nothing at all.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { getLocationTraffic } from "@/lib/server/datalastic.server";
import {
  datalasticGovernor,
  mayIssueRequest,
  recordFailure,
  recordRequestIssued,
  recordSuccess,
  resetDatalasticGovernor,
} from "@/lib/server/datalastic-governor";

const AT = "2026-08-29T09:00:00.000Z";
const NOW = Date.parse(AT);

beforeEach(() => resetDatalasticGovernor());

describe("credit exhaustion stops spending", () => {
  it("blocks paid requests after a 402", () => {
    expect(mayIssueRequest(NOW)).toBe(true);

    const state = recordFailure({ httpStatus: 402, at: AT, now: NOW });

    expect(state).toBe("CREDIT_EXHAUSTED");
    expect(mayIssueRequest(NOW + 1_000)).toBe(false);
  });

  /*
   * The point of the whole file. A request against an exhausted
   * allowance returns nothing and is still counted, so continuing to ask
   * is pure loss — and it buries the real reason under a stream of
   * identical failures.
   */
  it("counts what it refused, so the saving is visible", () => {
    recordFailure({ httpStatus: 402, at: AT, now: NOW });

    for (let i = 0; i < 5; i++) mayIssueRequest(NOW + 1_000);

    const snapshot = datalasticGovernor(NOW + 1_000);
    expect(snapshot.requestsBlocked).toBe(5);
    expect(snapshot.requestsIssued).toBe(0);
  });

  it("says it is a billing state, not an empty sea", () => {
    recordFailure({ httpStatus: 402, at: AT, now: NOW });

    const snapshot = datalasticGovernor(NOW);
    expect(snapshot.state).toBe("CREDIT_EXHAUSTED");
    expect(snapshot.reason).toMatch(/allowance/i);
    expect(snapshot.reason).toMatch(/not an empty sea/i);
  });

  /*
   * Only a person tops up an allowance, so a short cooldown would just
   * re-buy the same discovery every few minutes.
   */
  it("holds for an hour rather than retrying in a minute", () => {
    recordFailure({ httpStatus: 402, at: AT, now: NOW });

    expect(mayIssueRequest(NOW + 30 * 60_000)).toBe(false);
    expect(mayIssueRequest(NOW + 61 * 60_000)).toBe(true);
  });

  it("can be cleared by a person who has topped up", () => {
    recordFailure({ httpStatus: 402, at: AT, now: NOW });
    expect(mayIssueRequest(NOW)).toBe(false);

    resetDatalasticGovernor();

    expect(mayIssueRequest(NOW)).toBe(true);
    expect(datalasticGovernor(NOW).state).toBe("CONNECTED");
  });
});

describe("a rate limit is not an exhausted account", () => {
  it("blocks briefly and recovers on its own", () => {
    recordFailure({ httpStatus: 429, at: AT, now: NOW });

    expect(datalasticGovernor(NOW).state).toBe("RATE_LIMITED");
    expect(mayIssueRequest(NOW + 10_000)).toBe(false);
    // Waiting is the correct response here, and it is the only state
    // where that is true.
    expect(mayIssueRequest(NOW + 61_000)).toBe(true);
  });

  it("honours the provider's own Retry-After", () => {
    recordFailure({ httpStatus: 429, at: AT, retryAfterSeconds: 300, now: NOW });

    expect(mayIssueRequest(NOW + 120_000)).toBe(false);
    expect(mayIssueRequest(NOW + 301_000)).toBe(true);
  });
});

describe("faults in the request are not provider outages", () => {
  /*
   * A rejected request is a defect in what Seaphore asked. Blocking on
   * it would hide the defect behind an outage and stop the provider
   * being asked anything at all.
   */
  it("does not block on a rejected request", () => {
    recordFailure({ httpStatus: 400, at: AT, now: NOW });

    expect(datalasticGovernor(NOW).state).toBe("DEGRADED");
    expect(mayIssueRequest(NOW)).toBe(true);
  });

  it("treats an unreachable provider as a short outage", () => {
    recordFailure({ httpStatus: null, at: AT, now: NOW });

    expect(datalasticGovernor(NOW).state).toBe("UNAVAILABLE");
    expect(mayIssueRequest(NOW + 1_000)).toBe(false);
    expect(mayIssueRequest(NOW + 61_000)).toBe(true);
  });

  it("treats a server error as a short outage", () => {
    recordFailure({ httpStatus: 503, at: AT, now: NOW });

    expect(datalasticGovernor(NOW).state).toBe("UNAVAILABLE");
  });
});

describe("recovery", () => {
  it("returns to connected on a successful answer", () => {
    recordFailure({ httpStatus: 402, at: AT, now: NOW });
    resetDatalasticGovernor();
    recordRequestIssued();

    recordSuccess(AT);

    const snapshot = datalasticGovernor(NOW);
    expect(snapshot.state).toBe("CONNECTED");
    expect(snapshot.blockedUntil).toBeNull();
    expect(snapshot.lastSuccessAt).toBe(AT);
    expect(snapshot.requestsIssued).toBe(1);
  });

  /*
   * After a cooldown the provider is given one chance rather than being
   * assumed healthy — so a still-empty account blocks again on the very
   * next failure instead of resuming a spend.
   */
  it("tests the provider after cooldown rather than trusting it", () => {
    recordFailure({ httpStatus: 402, at: AT, now: NOW });

    expect(mayIssueRequest(NOW + 61 * 60_000)).toBe(true);
    expect(datalasticGovernor(NOW + 61 * 60_000).state).toBe("DEGRADED");

    recordFailure({ httpStatus: 402, at: AT, now: NOW + 61 * 60_000 });
    expect(mayIssueRequest(NOW + 61 * 60_000)).toBe(false);
  });
});

/*
 * The governor existing is not the same as the client consulting it.
 *
 * That distinction is exactly what caused the incident: the zones
 * declared a refresh interval and the engine ignored it. A control
 * nobody calls is not a control, so this asserts the wiring rather than
 * the logic — disabling the check in `request()` must fail here.
 */
describe("the client actually consults the governor", () => {
  it("makes no network call at all while credit is exhausted", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("the governor should have prevented this request");
    }) as typeof fetch;
    process.env["DATALASTIC_API_KEY"] = "test-key-not-a-real-credential";

    try {
      recordFailure({ httpStatus: 402, at: AT });

      const result = await getLocationTraffic({ lat: 6.4, lon: 3.4, radiusKm: 50 });

      // Not a socket, not a DNS lookup, and above all not a request the
      // provider would still count against an empty allowance.
      expect(calls).toBe(0);
      // And the refusal explains itself rather than looking like no vessels.
      expect(result.status).toBe("subscription-inactive");
      expect(result.message).toMatch(/allowance/i);
    } finally {
      globalThis.fetch = original;
      resetDatalasticGovernor();
      delete process.env["DATALASTIC_API_KEY"];
    }
  });
});
