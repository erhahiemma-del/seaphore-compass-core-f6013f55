/**
 * SPRINT UX-004 — Adaptive Briefing Profile Registry tests.
 */
import { describe, expect, it } from "vitest";
import type { AdaptiveBriefing as AdaptiveBriefingData } from "../../types";
import { BRIEFING_PROFILES, detectMissionType, getProfile } from "../registry";

function briefing(
  partial: Partial<AdaptiveBriefingData> & { query: string },
): AdaptiveBriefingData {
  const { query, ...rest } = partial;
  return {
    id: "b1",
    query,
    classification: {
      typeBadge: "Assessment",
      tier: "medium",
      compositeConfidence: 0.5,
      evidenceStrength: "moderate",
    },
    ...rest,
  };
}

describe("detectMissionType", () => {
  it("classifies sanctions queries", () => {
    expect(
      detectMissionType(briefing({ query: "Screen MV Ocean Pearl against OFAC sanctions" })),
    ).toBe("SANCTIONS_SCREENING");
  });

  it("classifies revenue queries", () => {
    expect(
      detectMissionType(briefing({ query: "Estimate revenue leakage at Apapa port last month" })),
    ).toBe("REVENUE_LEAKAGE");
  });

  it("classifies AIS queries", () => {
    expect(
      detectMissionType(briefing({ query: "Investigate AIS dark period for MV Ocean Pearl" })),
    ).toBe("AIS_INVESTIGATION");
  });

  it("classifies ownership queries", () => {
    expect(
      detectMissionType(briefing({ query: "Reveal beneficial ownership of the vessel" })),
    ).toBe("OWNERSHIP_INVESTIGATION");
  });

  it("classifies port congestion queries", () => {
    expect(
      detectMissionType(briefing({ query: "Assess port congestion and waiting time at Lagos" })),
    ).toBe("PORT_CONGESTION");
  });

  it("classifies compliance queries", () => {
    expect(
      detectMissionType(briefing({ query: "Run compliance review including PSC record" })),
    ).toBe("COMPLIANCE_REVIEW");
  });

  it("classifies environmental queries", () => {
    expect(detectMissionType(briefing({ query: "Show weather and sea state near voyage" }))).toBe(
      "ENVIRONMENTAL_RISK",
    );
  });

  it("classifies vessel risk queries", () => {
    expect(
      detectMissionType(briefing({ query: "Aggregate risk drivers and incident history" })),
    ).toBe("VESSEL_RISK");
  });

  it("respects explicit missionType hint", () => {
    const b = briefing({ query: "Tell me about MV Ocean Pearl" });
    (b as unknown as { missionType: string }).missionType = "REVENUE_LEAKAGE";
    expect(detectMissionType(b)).toBe("REVENUE_LEAKAGE");
  });

  it("falls back to GENERIC when nothing matches", () => {
    expect(detectMissionType(briefing({ query: "Say hello" }))).toBe("GENERIC");
  });
});

describe("BriefingProfile", () => {
  it("each profile has header + sources in its section order", () => {
    for (const p of Object.values(BRIEFING_PROFILES)) {
      expect(p.sectionOrder).toContain("header");
      expect(p.sectionOrder).toContain("sources");
      // Sources must be the last technical metadata slot.
      expect(p.sectionOrder[p.sectionOrder.length - 1]).toBe("sources");
    }
  });

  it("sanctions profile places evidence before analytical", () => {
    const p = getProfile("SANCTIONS_SCREENING");
    expect(p.sectionOrder.indexOf("evidence")).toBeLessThan(p.sectionOrder.indexOf("analytical"));
  });

  it("AIS profile leads with patterns (timeline/movement)", () => {
    const p = getProfile("AIS_INVESTIGATION");
    const patternsAt = p.sectionOrder.indexOf("patterns");
    const evidenceAt = p.sectionOrder.indexOf("evidence");
    expect(patternsAt).toBeGreaterThan(-1);
    expect(patternsAt).toBeLessThan(evidenceAt);
  });

  it("revenue profile emphasises decisionImpact before evidence", () => {
    const p = getProfile("REVENUE_LEAKAGE");
    expect(p.sectionOrder.indexOf("decisionImpact")).toBeLessThan(
      p.sectionOrder.indexOf("evidence"),
    );
  });

  it("ownership profile leads with entities", () => {
    const p = getProfile("OWNERSHIP_INVESTIGATION");
    const entitiesAt = p.sectionOrder.indexOf("entities");
    const evidenceAt = p.sectionOrder.indexOf("evidence");
    expect(entitiesAt).toBeGreaterThan(-1);
    expect(entitiesAt).toBeLessThan(evidenceAt);
  });

  it("follow-up commands are mission-specific", () => {
    const s = getProfile("SANCTIONS_SCREENING").followUpCommands(
      briefing({ query: "Screen MV Ocean Pearl" }),
    );
    expect(s.some((c) => /sanction/i.test(c.label))).toBe(true);
    const r = getProfile("REVENUE_LEAKAGE").followUpCommands(
      briefing({ query: "Revenue leakage at Apapa" }),
    );
    expect(r.some((c) => /revenue/i.test(c.label))).toBe(true);
    // No cross-contamination.
    expect(r.some((c) => /sanction/i.test(c.label))).toBe(false);
  });

  it("KPIs surface a sanctions-status card for sanctions profile", () => {
    const kpis = getProfile("SANCTIONS_SCREENING").computeKPIs(
      briefing({
        query: "Screen MV Ocean Pearl",
        criticalFindings: [
          {
            id: "1",
            priority: "immediate",
            title: "OFAC sanctions match found",
            grade: "VERIFIED",
            source: "OpenSanctions",
          },
        ],
      }),
    );
    expect(kpis[0].label).toBe("Sanctions Status");
    expect(kpis[0].tone).toBe("critical");
  });
});
