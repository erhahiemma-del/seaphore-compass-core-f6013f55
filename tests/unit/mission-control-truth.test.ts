/**
 * Mission Control must not present fixtures as observed intelligence.
 *
 * The projections are pure, so they are tested directly. The leak guard
 * is a source assertion: it proves the fixture module is no longer on the
 * production render path, which is stronger than asserting on rendered
 * output that happens to be empty today.
 *
 * TEST_FIXTURE — synthetic findings only.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  projectComplianceWatchlist,
  projectIntelligenceFeed,
  projectPortOperations,
  projectRecentBriefings,
  projectTodaysPriorities,
} from "@/lib/intelligence/dashboard-projection";
import type { KpiCoverage } from "@/lib/intelligence/coverage-model";
import type { LeakageFinding } from "@/services/revenue-leakage";

const MISSION_CONTROL = "src/features/mission-control/MissionControl.tsx";

/** TEST_FIXTURE — an ACTIVE capability with evidence behind it. */
const ACTIVE: KpiCoverage = {
  key: "risk",
  state: "ACTIVE",
  stateDetail: "Reporting.",
} as unknown as KpiCoverage;

const OFFLINE: KpiCoverage = {
  key: "risk",
  state: "PROVIDER_OFFLINE",
  stateDetail: "The provider is unreachable.",
} as unknown as KpiCoverage;

/** TEST_FIXTURE — a synthetic finding. Never a real observation. */
function finding(overrides: Partial<LeakageFinding> = {}): LeakageFinding {
  return {
    id: "f-1",
    category: "under-declaration",
    subjectId: "e-1",
    subjectLabel: "TEST_FIXTURE Subject",
    headline: "TEST_FIXTURE headline",
    explanation: "TEST_FIXTURE explanation",
    magnitudeCurrency: "NGN",
    magnitude: 1_000,
    confidence: "OBSERVED",
    priority: "high",
    factors: [],
    citations: [],
    detectedAt: "2026-08-22T10:00:00.000Z",
    humanApproved: false,
    ...overrides,
  } as LeakageFinding;
}

/* ═══════ 1 & 7. No fabricated fallback ═══════ */

describe("panels never fall back to fabricated intelligence", () => {
  it("an offline provider yields no data at all, not a placeholder", () => {
    const feed = projectIntelligenceFeed({ uipId: "u1", findings: [], coverage: OFFLINE });
    const priorities = projectTodaysPriorities({ uipId: "u1", findings: [], coverage: OFFLINE });

    // `data: null` is the guarantee — there is no shape to fill with mock
    // values, so a panel physically cannot render invented rows.
    expect(feed.data).toBeNull();
    expect(priorities.data).toBeNull();
    expect(feed.state).toBe("PROVIDER_OFFLINE");
  });

  it("carries the reason forward rather than a bare zero", () => {
    const feed = projectIntelligenceFeed({ uipId: "u1", findings: [], coverage: OFFLINE });
    expect(feed.stateDetail).toContain("unreachable");
  });

  it("no UIP means no projection, however healthy the capability", () => {
    const feed = projectIntelligenceFeed({ uipId: null, findings: [], coverage: ACTIVE });
    expect(feed.data).toBeNull();
    expect(feed.state).not.toBe("ACTIVE");
  });
});

/* ═══════ 3 & 4. Honest empty states ═══════ */

describe("empty is a real answer", () => {
  it("an active scan with no findings is NO_EVIDENCE, not an empty list", () => {
    const feed = projectIntelligenceFeed({ uipId: "u1", findings: [], coverage: ACTIVE });
    expect(feed.state).toBe("NO_EVIDENCE");
    expect(feed.data).toBeNull();
  });

  it("findings that are none of them urgent give an empty but ACTIVE queue", () => {
    // The distinction the panel depends on: the capability ran and found
    // nothing urgent, which is different from never having run.
    const priorities = projectTodaysPriorities({
      uipId: "u1",
      findings: [finding({ priority: "low" }), finding({ id: "f-2", priority: "medium" })],
      coverage: ACTIVE,
    });

    expect(priorities.state).toBe("ACTIVE");
    expect(priorities.data?.items).toEqual([]);
  });
});

/* ═══════ 5. Verified findings render ═══════ */

describe("real findings pass through unchanged", () => {
  it("renders the finding the capability produced", () => {
    const feed = projectIntelligenceFeed({
      uipId: "u1",
      findings: [finding({ headline: "Declared tonnage below manifest" })],
      coverage: ACTIVE,
    });

    expect(feed.state).toBe("ACTIVE");
    expect(feed.data?.signals).toHaveLength(1);
    expect(feed.data?.signals[0].title).toBe("Declared tonnage below manifest");
  });

  it("keeps only critical and high in the priority queue", () => {
    const priorities = projectTodaysPriorities({
      uipId: "u1",
      findings: [
        finding({ id: "a", priority: "low" }),
        finding({ id: "b", priority: "critical" }),
        finding({ id: "c", priority: "high" }),
      ],
      coverage: ACTIVE,
    });

    expect(priorities.data?.items.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("does not re-rank — critical precedes high, as the capability said", () => {
    const priorities = projectTodaysPriorities({
      uipId: "u1",
      findings: [
        finding({ id: "high", priority: "high", magnitude: 999_999 }),
        finding({ id: "crit", priority: "critical", magnitude: 1 }),
      ],
      coverage: ACTIVE,
    });

    // Magnitude does not promote a finding above its assigned priority.
    expect(priorities.data?.items[0].id).toBe("crit");
  });
});

/* ═══════ 6. Confidence is carried, not computed ═══════ */

describe("confidence comes from the evidence grade", () => {
  it("maps the finding's own grade rather than assigning one", () => {
    const strong = projectIntelligenceFeed({
      uipId: "u1",
      findings: [finding({ confidence: "VERIFIED" })],
      coverage: ACTIVE,
    });
    const weak = projectIntelligenceFeed({
      uipId: "u1",
      findings: [finding({ confidence: "INFERRED" })],
      coverage: ACTIVE,
    });

    expect(strong.data?.signals[0].confidence).not.toBe(weak.data?.signals[0].confidence);
  });

  it("never labels an inference as an observation", () => {
    const weak = projectIntelligenceFeed({
      uipId: "u1",
      findings: [finding({ confidence: "INFERRED" })],
      coverage: ACTIVE,
    });
    expect(weak.data?.signals[0].confidence).not.toBe("observed");
    expect(weak.data?.signals[0].confidence).not.toBe("verified");
  });

  it("preserves the officer-approval flag rather than assuming it", () => {
    const priorities = projectTodaysPriorities({
      uipId: "u1",
      findings: [finding({ humanApproved: true })],
      coverage: ACTIVE,
    });
    expect(priorities.data?.items[0].approved).toBe(true);
  });
});

/* ═══════ Currency is a separate axis from availability ═══════ */

describe("freshness is reported independently of availability", () => {
  const NOW = Date.parse("2026-08-22T12:00:00.000Z");
  const at = (ms: number) => new Date(NOW - ms).toISOString();

  function feedAt(detectedAt: string) {
    return projectIntelligenceFeed({
      uipId: "u1",
      findings: [finding({ detectedAt })],
      coverage: ACTIVE,
      now: NOW,
    });
  }

  it("reports a recent signal as fresh", () => {
    expect(feedAt(at(30_000)).data?.freshness).toBe("fresh");
  });

  it("reports an old signal as stale while still ACTIVE", () => {
    // The case a single merged enum could not express: the capability is
    // reporting normally, and what it reports is old.
    const feed = feedAt(at(30 * 24 * 3_600_000));
    expect(feed.state).toBe("ACTIVE");
    expect(feed.data?.freshness).toBe("stale");
  });

  it("never calls an unparseable timestamp fresh", () => {
    expect(feedAt("not-a-date").data?.freshness).toBe("unknown");
  });

  it("flags a partial feed when a signal could not be graded", () => {
    const feed = projectIntelligenceFeed({
      uipId: "u1",
      findings: [finding({ confidence: undefined as never })],
      coverage: ACTIVE,
      now: NOW,
    });
    expect(feed.data?.partial).toBe(true);
  });

  it("is not partial when every signal carries a grade", () => {
    expect(feedAt(at(1_000)).data?.partial).toBe(false);
  });
});

/* ═══════ Panels with no connected provider ═══════ */

describe("panels without a provider say so rather than inventing numbers", () => {
  const panels = [
    ["port operations", projectPortOperations({ uipId: null })],
    ["compliance watchlist", projectComplianceWatchlist({ uipId: null })],
    ["recent briefings", projectRecentBriefings({ uipId: null })],
  ] as const;

  it.each(panels)("%s reports NO_PROVIDER", (_name, projection) => {
    expect(projection.state).toBe("NO_PROVIDER");
  });

  it.each(panels)("%s carries no data to render", (_name, projection) => {
    // The guarantee that matters: there is nothing for a panel to
    // accidentally display as intelligence.
    expect(projection.data).toBeNull();
  });

  it.each(panels)("%s explains what is missing", (_name, projection) => {
    expect(projection.stateDetail.length).toBeGreaterThan(40);
  });

  it("distinguishes a missing provider from an empty result", () => {
    // NO_PROVIDER ≠ NO_EVIDENCE. One means we never looked, the other
    // means we looked and found nothing — an officer must not read the
    // first as the second.
    expect(projectPortOperations({ uipId: null }).state).not.toBe("NO_EVIDENCE");
  });

  it("never claims a congestion index without a source", () => {
    const detail = projectPortOperations({ uipId: null }).stateDetail;
    expect(detail).toMatch(/NPA SHIPPOS/);
    // The fabricated fixture values must not survive anywhere.
    expect(JSON.stringify(projectPortOperations({ uipId: null }))).not.toMatch(/\b88\b|Critical/);
  });

  it("does not claim zero sanctioned arrivals", () => {
    // A bare 0 would assert that nothing arrived. Seaphore does not know
    // that — it has no arrivals source at all.
    const projection = projectComplianceWatchlist({ uipId: null });
    expect(projection.data).toBeNull();
    expect(projection.stateDetail).toMatch(/no arrivals source is connected/i);
  });
});

/* ═══════ 2 & 8. Fixture leak guard ═══════ */

describe("fixture intelligence cannot reach the production render path", () => {
  const raw = readFileSync(MISSION_CONTROL, "utf8");
  // Comments are stripped before asserting. The file documents the defect
  // it fixed — naming the fabricated vessel in that history is correct,
  // and a guard that forbade it would forbid explaining the bug.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("does not import the fabricated feed or priority fixtures", () => {
    // Not a global string ban — tests and fixtures may still use these
    // names. This asserts only that Mission Control no longer renders them.
    expect(source).not.toContain("INTELLIGENCE_FEED");
    expect(source).not.toContain("TODAYS_PRIORITIES");
  });

  it("contains no hardcoded vessel name", () => {
    for (const name of ["Ocean Pearl", "Crimson Endeavour", "Blue Horizon"]) {
      expect(source).not.toContain(name);
    }
  });

  it("contains no hardcoded IMO number", () => {
    // Seven consecutive digits in a string literal is the shape of an IMO.
    expect(source).not.toMatch(/["']\d{7}["']/);
  });

  it("makes no hardcoded operational claim", () => {
    for (const claim of ["signal lost", "under-declaration", "₦98M", "signal loss"]) {
      expect(source.toLowerCase()).not.toContain(claim.toLowerCase());
    }
  });

  it("renders both panels from a projection", () => {
    expect(source).toContain("projectIntelligenceFeed");
    expect(source).toContain("projectTodaysPriorities");
  });
});
