// @vitest-environment jsdom
/**
 * The KPI ribbon must never invent a number or a trend.
 *
 * Every value comes from the coverage model (the KPI source of truth), so a
 * card can only ever say what coverage says — and re-renders with new
 * coverage the moment live data arrives.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";


import { KpiRibbon } from "@/features/mission-control/kpi-ribbon";
import type { IntelligenceCoverageReport, KpiCoverage } from "@/lib/intelligence/coverage-model";
import { RIBBON_KPIS } from "@/lib/mission-control-data";

vi.mock("@/components/intelligence/IntelligenceReadinessCard", () => ({
  IntelligenceReadinessCard: () => null,
}));

/** TEST_FIXTURE */
function kpi(over: Partial<KpiCoverage> & Pick<KpiCoverage, "key">): KpiCoverage {
  return {
    title: "TEST_FIXTURE",
    descriptor: "TEST_FIXTURE descriptor",
    display: "—",
    value: null,
    state: "NO_PROVIDER",
    stateLabel: "Source pending",
    stateDetail: "No provider connected",
    rootCause: "NO_PROVIDER",
    rootCauseDetail: "",
    evidenceCount: 0,
    coveragePct: 0,
    confidence: "unknown",
    projectionContractId: "test",
    projectionStatus: "MAPPED",
    dashboardField: "test",
    dashboardStatus: "READING_CORRECT_FIELD",
    checks: {},
    providers: [],
    providerCatalogHref: "/data-sources",
    ...over,
  } as unknown as KpiCoverage;
}

function report(kpis: KpiCoverage[]): IntelligenceCoverageReport {
  return {
    generatedAt: new Date("2026-08-25T12:00:00.000Z").toISOString(),
    readiness: { pct: 0, answerable: 0, total: 6 },
    kpis,
  } as unknown as IntelligenceCoverageReport;
}

afterEach(cleanup);

describe("KPI ribbon is bound to the coverage model", () => {
  it("keeps all six cards on screen with no coverage at all", () => {
    render(<KpiRibbon coverage={undefined} onOpen={() => {}} />);

    for (const k of RIBBON_KPIS) {
      expect(screen.getByText(k.title)).toBeTruthy();
    }
  });

  it("shows the measured display string coverage published, not its own format", () => {
    render(
      <KpiRibbon
        coverage={report([
          kpi({ key: "revenue", display: "₦412.8M", value: 412_800_000, descriptor: "Revenue leakage identified" }),
        ])}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByText("₦412.8M")).toBeTruthy();
    expect(screen.getByText("Revenue leakage identified")).toBeTruthy();
  });

  it("states the coverage position instead of a number when nothing is measured", () => {
    render(
      <KpiRibbon
        coverage={report([kpi({ key: "vessel", stateLabel: "Source pending" })])}
        onOpen={() => {}}
      />,
    );

    expect(screen.getAllByText("Source pending").length).toBeGreaterThan(0);
  });

  it("fabricates no percentage, arrow or day-over-day comparison anywhere", () => {
    // The coverage model publishes no comparison series. Any "↑ 12% vs
    // yesterday" on this ribbon would therefore be invented.
    const { container } = render(
      <KpiRibbon
        coverage={report([kpi({ key: "risk", display: "18", value: 18 })])}
        onOpen={() => {}}
      />,
    );

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/vs\s+(yesterday|last)/i);
    expect(text).not.toMatch(/[↑↓]/);
    expect(text).not.toMatch(/[+-]\d+(\.\d+)?%/);
  });

  it("re-renders new values when live coverage replaces pending coverage", () => {
    const pending = report([kpi({ key: "vessel", stateLabel: "Source pending" })]);
    const live = report([
      kpi({ key: "vessel", display: "128", value: 128, descriptor: "Vessels tracked at sea" }),
    ]);

    const view = render(<KpiRibbon coverage={pending} onOpen={() => {}} />);
    expect(view.container.textContent).toContain("Source pending");

    view.rerender(<KpiRibbon coverage={live} onOpen={() => {}} />);
    expect(view.container.textContent).toContain("128");
    expect(view.container.textContent).toContain("Vessels tracked at sea");
  });
});
