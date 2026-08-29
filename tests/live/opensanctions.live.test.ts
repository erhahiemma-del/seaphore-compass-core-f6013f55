/**
 * Live proof that the configured OpenSanctions credential works.
 *
 * Deliberately not in `tests/unit`: it needs network and a real
 * credential, so it must never run in the offline suite. It builds
 * nothing — the connector, the normalisation and the state model all
 * already exist — it only establishes that the server client reaches the
 * provider and that a real response normalises the way the existing
 * model says it should.
 *
 * Skips itself without a credential, because an absent secret is not a
 * broken build.
 *
 * Two subjects, chosen for opposite outcomes: a name that is certainly
 * on a sanctions list, and one that is certainly not. A screening
 * integration that only ever returns matches proves as little as one
 * that only ever returns none.
 */
import { describe, expect, it } from "vitest";

import { credentialStatus, screenSubject } from "@/lib/server/opensanctions.server";

const CONFIGURED = credentialStatus().configured;

describe.skipIf(!CONFIGURED)("OpenSanctions, against the live provider", () => {
  it("reaches the provider and normalises a subject that should match", async () => {
    const outcome = await screenSubject({
      name: "Vladimir Putin",
      schema: "Person",
    });

    expect(outcome.failureReason).toBeNull();
    expect(outcome.state).not.toBe("SCREENING_UNAVAILABLE");

    // A real answer, not a fixture.
    expect(outcome.candidates.length).toBeGreaterThan(0);
    expect(outcome.dataset.length).toBeGreaterThan(0);

    /*
     * The candidate is a provider suggestion and nothing more. Only an
     * authenticated officer may reach CONFIRMED_MATCH, so no live
     * response is permitted to arrive already confirmed.
     */
    expect(outcome.state).not.toBe("CONFIRMED_MATCH");

    const top = outcome.candidates[0];
    expect(top.id.length).toBeGreaterThan(0);
    expect(top.caption.length).toBeGreaterThan(0);
    expect(top.score).toBeGreaterThan(0);
  }, 30_000);

  it("reports no match as a real answer rather than a failure", async () => {
    const outcome = await screenSubject({
      name: "Zzqx Nonexistent Test Subject 84321",
      schema: "Person",
    });

    /*
     * The distinction the whole state model exists for: the provider
     * answered, and the answer was nobody. That is not an outage and
     * must never be filed as one.
     */
    expect(outcome.failureReason).toBeNull();
    expect(outcome.state).toBe("NO_MATCH");
    expect(outcome.candidates).toHaveLength(0);
  }, 30_000);
});

describe.skipIf(CONFIGURED)("OpenSanctions without a credential", () => {
  it("refuses rather than reporting a clean subject", async () => {
    const outcome = await screenSubject({ name: "Any Subject", schema: "Person" });

    // Never NO_MATCH: an unconfigured provider has screened nobody.
    expect(outcome.state).toBe("SCREENING_UNAVAILABLE");
    expect(outcome.failureReason).toBe("AUTHENTICATION_FAILED");
  });
});
