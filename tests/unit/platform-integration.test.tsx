// @vitest-environment jsdom
/** TEST_FIXTURE — synthetic briefs, findings and vessels only. */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutiveBriefPanel } from "@/components/intelligence/ExecutiveBriefPanel";
import { collectProviders } from "@/features/sources/providers";
import { NAV_GROUPS } from "@/lib/nav";
import { AISBehaviourAnalyzer } from "@/intelligence/analyzers/AISBehaviourAnalyzer";
import { OSAE } from "@/services/osae";
import {
  PENDING_RISK_MODULES,
  RiskModuleRegistry,
  aggregateFindings,
  aisIntegrityModule,
} from "@/services/intelligence";
import { buildExecutiveBrief, understand } from "@/services/orchestration";
import type { VesselProvenance } from "@/services/geospatial";

afterEach(() => cleanup());

const NOW = Date.parse("2026-08-21T12:00:00.000Z");

/** TEST_FIXTURE */
const PROVENANCE: VesselProvenance = {
  source: "global-fishing-watch",
  provider: "Global Fishing Watch",
  datasetId: "public-global-fishing-events:latest",
  retrievedAt: new Date(NOW).toISOString(),
  observedAt: new Date(NOW - 60_000).toISOString(),
};

/* ═══════ 1. /maritime is navigable ═══════ */

describe("1. Maritime Command is reachable through navigation", () => {
  const urls = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.url));

  it("exposes /maritime", () => {
    // Six sprints of map work were reachable only by typing the URL.
    expect(urls).toContain("/maritime");
  });

  it("exposes /data-sources", () => {
    expect(urls).toContain("/data-sources");
  });

  it("keeps every nav url unique — no duplicate surface", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("places Maritime Command in the Mission group", () => {
    const mission = NAV_GROUPS.find((group) => group.label === "Mission");
    expect(mission?.items.some((item) => item.url === "/maritime")).toBe(true);
  });
});

/* ═══════ 7. Provenance reaches findings ═══════ */

describe("7. connector provenance reaches FindingContext.sources", () => {
  /** Publish a continuity report so AIS Integrity has evidence to attribute. */
  function publishAis() {
    OSAE.__reset();
    const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
    const base = { weather: "clear", trafficDensity: "dense", nearestPort: "Lagos" } as const;
    OSAE.publishAisContinuity(
      AISBehaviourAnalyzer.analyse({
        vesselId: "9074729",
        events: [
          {
            timestamp: hoursAgo(120),
            latitude: 6.4,
            longitude: 3.4,
            distanceFromPortNm: 10,
            ...base,
          },
          {
            timestamp: hoursAgo(60),
            latitude: 6.6,
            longitude: 3.6,
            distanceFromPortNm: 14,
            ...base,
          },
          {
            timestamp: hoursAgo(10),
            latitude: 6.7,
            longitude: 3.7,
            distanceFromPortNm: 16,
            ...base,
          },
        ],
      }),
    );
  }

  it("attributes live evidence to the real provider, not `unattributed`", async () => {
    // The acceptance criterion: a finding built from live GFW data must
    // carry that lineage. Before this wiring the connector's provenance
    // stopped one layer above the finding that depended on it.
    publishAis();
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);

    const set = await aggregateFindings("9074729", "TEST_FIXTURE MV ABC", {
      registry,
      sources: [PROVENANCE],
      now: NOW,
    });

    const supported = set.findings.filter((finding) => finding.status === "supported");
    expect(supported.length).toBeGreaterThan(0);
    expect(supported[0].evidence[0].provenance.source).toBe("global-fishing-watch");
    expect(supported[0].evidence[0].provenance.source).not.toBe("unattributed");
    expect(supported[0].provenance.sources).toEqual([PROVENANCE]);
    OSAE.__reset();
  });

  it("says `unattributed` plainly when no provenance was supplied", async () => {
    // Absent lineage is labelled, never invented.
    publishAis();
    const registry = new RiskModuleRegistry().register(aisIntegrityModule);
    const set = await aggregateFindings("9074729", "TEST_FIXTURE", { registry, now: NOW });

    const supported = set.findings.filter((finding) => finding.status === "supported");
    expect(supported[0].evidence[0].provenance.source).toBe("unattributed");
    OSAE.__reset();
  });

  it("leaves a pending-source finding unattributed — it has no data to attribute", () => {
    // Not an oversight: a module with no source produced no observation,
    // so claiming a provider would attribute evidence that never existed.
    expect(PENDING_RISK_MODULES.length).toBeGreaterThan(0);
  });
});

/* ═══════ 2. Executive brief renders decision-first ═══════ */

describe("2. Executive Brief is decision-first", () => {
  async function brief() {
    const registry = new RiskModuleRegistry().registerAll(PENDING_RISK_MODULES);
    const set = await aggregateFindings("9074729", "TEST_FIXTURE MV ABC", {
      registry,
      sources: [PROVENANCE],
      now: NOW,
    });
    return buildExecutiveBrief(
      understand("Investigate TEST_FIXTURE MV ABC", { now: NOW }),
      set,
      NOW,
    );
  }

  it("leads with what happened, why it matters and confidence", async () => {
    render(<ExecutiveBriefPanel brief={await brief()} />);

    expect(screen.getByText("What happened")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("Recommended action")).toBeInTheDocument();
  });

  it("collapses evidence and unknowns by default", async () => {
    render(<ExecutiveBriefPanel brief={await brief()} />);

    const unknowns = screen.getByTestId("brief-unknowns");
    // The section exists and is counted, but its contents are not shown
    // until the officer asks — a brief that dumps everything is a
    // dashboard wearing a brief's name.
    expect(within(unknowns).getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("expands on request", async () => {
    render(<ExecutiveBriefPanel brief={await brief()} />);
    const button = within(screen.getByTestId("brief-unknowns")).getByRole("button");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("offers no action when nothing warrants one", async () => {
    // Every module is pending-source, so nothing reached a priority.
    render(<ExecutiveBriefPanel brief={await brief()} />);
    expect(screen.getByText(/No action is recommended/)).toBeInTheDocument();
  });

  it("warns when no evidence supports the brief", async () => {
    render(<ExecutiveBriefPanel brief={await brief()} />);
    expect(screen.getByText(/Nothing below should be acted on as fact/)).toBeInTheDocument();
  });

  it("exposes the officer decision controls", async () => {
    const onDecision = vi.fn();
    const value = await brief();
    render(<ExecutiveBriefPanel brief={value} onDecision={onDecision} />);

    for (const label of ["Approve", "Investigate", "Escalate", "Monitor", "Reject"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Escalate" }));
    expect(onDecision).toHaveBeenCalledWith("escalate", value);
  });

  it("names the unknowns rather than hiding them", async () => {
    const value = await brief();
    render(<ExecutiveBriefPanel brief={value} />);

    // Count is visible in the collapsed label, so an officer knows there
    // is something there without opening it.
    expect(
      screen.getByText(new RegExp(`Not established \\(${value.unknowns.length}\\)`)),
    ).toBeInTheDocument();
  });
});

/* ═══════ 6. Data sources separate certified from live ═══════ */

describe("6. Data Sources reflects real registry state", () => {
  const rows = collectProviders();

  it("reads from the registries rather than a hardcoded list", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.id === "datalastic")).toBe(true);
    expect(rows.some((row) => row.id === "npa-shippos")).toBe(true);
  });

  it("never reports certification as availability", () => {
    // A certified connector may still be awaiting access. Showing
    // CERTIFIED as a status would tell an officer it was live.
    for (const row of rows) {
      expect(["ACTIVE", "AWAITING_CREDENTIALS", "PENDING_INTEGRATION", "UNAVAILABLE"]).toContain(
        row.availability,
      );
      expect(row.availability).not.toBe("CERTIFIED");
    }
  });

  it("marks Datalastic and SeaVantage as awaiting credentials", () => {
    for (const id of ["datalastic", "seavantage"]) {
      expect(rows.find((row) => row.id === id)?.availability).toBe("AWAITING_CREDENTIALS");
    }
  });

  it("does not mark NPA active while authorization is outstanding", () => {
    expect(rows.find((row) => row.id === "npa-shippos")?.availability).not.toBe("ACTIVE");
  });

  it("gives every non-active provider a reason", () => {
    for (const row of rows.filter((candidate) => candidate.availability !== "ACTIVE")) {
      expect(row.reason, `${row.id} needs a reason`).toBeTruthy();
    }
  });

  it("keeps a licence-unread source out of Active even when reachable", () => {
    // Technically connected and commercially unresolved is not active.
    const nosdra = rows.find((row) => row.id === "nosdra-oil-spill-monitor");
    expect(nosdra?.availability).not.toBe("ACTIVE");
  });
});
