/**
 * The single next action.
 *
 * The failure this guards is manufactured urgency. A panel that always
 * has something to say is one officers stop reading, so "nothing
 * requires your attention" must be reachable and must render as a
 * legitimate state rather than an error or an empty card.
 *
 * The second failure is a recommendation that sends the officer
 * somewhere useless. A blocked dependency has to outrank the lens's
 * standing advice, or an officer whose revenue provider has no
 * credentials gets told to go and review revenue figures — arrives,
 * finds nothing, and learns the recommendation is decorative.
 */
import { describe, expect, it } from "vitest";

import type { KpiCoverage, RootCause } from "@/lib/intelligence/coverage-model";
import { MISSION_MODES } from "@/features/mission-control/modes";
import { deriveRecommendedAction } from "@/features/mission-control/recommended-action";

function kpi(over: Partial<KpiCoverage>): KpiCoverage {
  return {
    key: "revenue",
    title: "Revenue Intelligence",
    descriptor: "",
    display: "—",
    value: null,
    state: "AWAITING_CREDENTIALS",
    stateLabel: "Awaiting credentials",
    stateDetail: "",
    rootCause: "CREDENTIALS_MISSING" as RootCause,
    rootCauseDetail: "",
    evidenceCount: 0,
    coveragePct: 0,
    confidence: "unknown",
    projectionContractId: "",
    projectionStatus: "MAPPED",
    dashboardField: "",
    dashboardStatus: "READING_CORRECT_FIELD",
    checks: {} as KpiCoverage["checks"],
    providers: [],
    providerCatalogHref: "/data-sources",
    sourceOfTruth: "",
    ...over,
  } as KpiCoverage;
}

const MODE = MISSION_MODES["revenue-assurance"];

describe("a blocked dependency outranks the lens's standing advice", () => {
  it("points at source health when credentials are missing", () => {
    const out = deriveRecommendedAction(MODE, [kpi({})]);
    expect(out.urgency).toBe("blocked");
    expect(out.headline).toContain("Revenue Intelligence");
    expect(out.reason).toMatch(/credentials have not been configured/i);
    expect(out.href).toBe("/data-sources");
  });

  it("prefers the worst cause, not the first listed", () => {
    // Scanning by severity means the officer is pointed at the most
    // consequential blockage rather than whichever the model listed first.
    const out = deriveRecommendedAction(MODE, [
      kpi({ title: "Risk Intelligence", rootCause: "RATE_LIMITED" }),
      kpi({ title: "Revenue Intelligence", rootCause: "CREDENTIALS_INVALID" }),
    ]);
    expect(out.headline).toContain("Revenue Intelligence");
    expect(out.reason).toMatch(/rejected/i);
  });

  it("uses the coverage model's own provider link rather than inventing one", () => {
    const out = deriveRecommendedAction(MODE, [
      kpi({ providerCatalogHref: "/admin/provider-health" }),
    ]);
    expect(out.href).toBe("/admin/provider-health");
  });

  it("does not treat an honest empty result as a blockage", () => {
    // A provider that answered and found nothing is working correctly.
    // Sending an officer to "resolve" that would be a false errand.
    const out = deriveRecommendedAction(MODE, [kpi({ rootCause: "EMPTY_EVIDENCE" })]);
    expect(out.urgency).toBe("routine");
  });
});

describe("routine advice comes from the active lens", () => {
  it("uses the lens's own first action", () => {
    const out = deriveRecommendedAction(MODE, [kpi({ rootCause: "NONE" })]);
    expect(out.urgency).toBe("routine");
    expect(out.href).toBe(MODE.actions[0].href);
    expect(out.headline).toBe(MODE.actions[0].label);
  });

  it("differs between lenses", () => {
    const clean = [kpi({ rootCause: "NONE" })];
    const revenue = deriveRecommendedAction(MISSION_MODES["revenue-assurance"], clean);
    const investigation = deriveRecommendedAction(MISSION_MODES["investigation"], clean);
    expect(revenue.href).not.toBe(investigation.href);
  });

  it("always resolves to a route when it offers one", () => {
    for (const id of Object.keys(MISSION_MODES) as (keyof typeof MISSION_MODES)[]) {
      const out = deriveRecommendedAction(MISSION_MODES[id], [kpi({ rootCause: "NONE" })]);
      expect(out.href?.startsWith("/")).toBe(true);
    }
  });
});

describe("silence is a legitimate state", () => {
  it("offers no action when the lens declares none", () => {
    const bare = { ...MISSION_MODES["national-picture"], actions: [] };
    const out = deriveRecommendedAction(bare, [kpi({ rootCause: "NONE" })]);
    expect(out.urgency).toBe("none");
    expect(out.href).toBeNull();
    expect(out.actionLabel).toBeNull();
    expect(out.headline).toMatch(/no immediate action/i);
  });

  it("handles absent coverage without inventing a blockage", () => {
    // Coverage still loading is not the same as a provider being down.
    const out = deriveRecommendedAction(MODE, undefined);
    expect(out.urgency).toBe("routine");
  });
});

describe("the recommendation carries no fabricated quantity", () => {
  it("never states a count", () => {
    // A number here would be derived, and every derived number is one an
    // officer can find disagreeing with the panel behind it.
    const cases = [
      deriveRecommendedAction(MODE, [kpi({})]),
      deriveRecommendedAction(MODE, [kpi({ rootCause: "NONE" })]),
      deriveRecommendedAction({ ...MODE, actions: [] }, undefined),
    ];
    for (const out of cases) {
      expect(`${out.headline} ${out.reason}`).not.toMatch(/\b\d+\b/);
    }
  });
});
