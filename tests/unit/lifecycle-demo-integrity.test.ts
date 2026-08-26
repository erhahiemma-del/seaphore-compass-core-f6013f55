/**
 * The lifecycle fixtures may render. They may not pass as intelligence.
 *
 * These surfaces have no provider behind them, so retiring the fixtures
 * would leave five blank routes. They ship, marked — and these tests
 * pin the properties that keep the marking honest.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEMO_DATA_ENABLED, DEMO_PROVENANCE, demoOnly } from "@/lib/demo/gate";
import { AI_FINDINGS, EVIDENCE_ITEMS, INVESTIGATIONS, SIGNALS } from "@/lib/lifecycle-data";

const read = (p: string) => readFileSync(p, "utf8");
const LIFECYCLE = "src/lib/lifecycle-data.ts";

/* ═══════ 1 & 2. No fixture claims to have been observed ═══════ */

describe("fixtures cannot claim observation or verification", () => {
  it("gives no signal an observed or verified confidence", () => {
    // "observed" is documented as "Directly observed / measured". No
    // invented event was either.
    for (const signal of SIGNALS) {
      expect(["observed", "verified"]).not.toContain(signal.confidence);
    }
  });

  it("holds across every fixture dataset, not just signals", () => {
    const graded = [...EVIDENCE_ITEMS, ...AI_FINDINGS, ...INVESTIGATIONS] as ReadonlyArray<{
      confidence?: string;
    }>;
    for (const row of graded) {
      if (row.confidence) expect(["observed", "verified"]).not.toContain(row.confidence);
    }
  });

  it("leaves no observed/verified literal in the source at all", () => {
    const source = read(LIFECYCLE);
    expect(source).not.toContain('confidence: "observed"');
    expect(source).not.toContain('confidence: "verified"');
  });
});

/* ═══════ 3. Fabricated identities are unmistakable ═══════ */

describe("fabricated IMOs cannot pass as real registry numbers", () => {
  it("prefixes every fixture IMO", () => {
    // A bare seven-digit number is indistinguishable from a real entry,
    // and some of these collide with real vessels.
    for (const signal of SIGNALS) {
      if (signal.imo) expect(signal.imo).toMatch(/^DEMO-/);
    }
  });

  it("leaves no bare seven-digit IMO literal in the source", () => {
    expect(read(LIFECYCLE)).not.toMatch(/imo: "\d{7}"/);
  });
});

/* ═══════ 4. No wall-clock recency claims ═══════ */

describe("fixture timestamps do not imply real recency", () => {
  it("uses simulation offsets rather than 'ago'", () => {
    // "12 min ago" asserts something just happened. Comments are stripped
    // first — the file's own docs quote the banned form to explain it.
    const code = read(LIFECYCLE).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/"\d+\s+(min|mins|minutes|h|hours|hrs|d|days) ago"/);
  });

  it("labels signals with an explicit offset form", () => {
    for (const signal of SIGNALS) {
      if (signal.detectedLabel) expect(signal.detectedLabel).not.toMatch(/ ago$/);
    }
  });
});

/* ═══════ 5 & 6. The gate and its semantics ═══════ */

describe("demo fixtures require explicit activation", () => {
  it("is a compile-time constant, not a runtime toggle", () => {
    expect(typeof DEMO_DATA_ENABLED).toBe("boolean");
  });

  it("passes fixtures through only when demo data is permitted", () => {
    const rows = demoOnly([1, 2, 3]);
    expect(rows).toEqual(DEMO_DATA_ENABLED ? [1, 2, 3] : []);
  });

  it("states plainly that its content is not an observation", () => {
    expect(DEMO_PROVENANCE).toMatch(/not an observation/i);
  });
});

/* ═══════ Surfaces mark themselves ═══════ */

describe("every fixture-backed route carries the notice", () => {
  it.each([
    "src/features/detect/Detect.tsx",
    "src/features/investigate/InvestigateList.tsx",
    "src/features/investigate/InvestigateCase.tsx",
    "src/features/decision-support/DecideList.tsx",
    "src/features/decision-support/DecideCase.tsx",
    "src/features/share/ShareList.tsx",
    "src/features/share/ShareCase.tsx",
    "src/features/memory/Memory.tsx",
  ])("%s renders DemoDataNotice", (path) => {
    expect(read(path)).toContain("<DemoDataNotice");
  });

  it("says simulated without styling itself as a fault", () => {
    const notice = read("src/components/intelligence/DemoDataNotice.tsx");
    expect(notice).toMatch(/Simulated/);
    // Amber, not red: this is a statement about provenance, not an outage.
    expect(notice).not.toMatch(/text-red-|bg-red-/);
  });
});

/* ═══════ The second fixture layer: Intelligence Centre ═══════ */

describe("intel-centre fixtures cannot claim observation either", () => {
  const INTEL = "src/lib/intel-centre-data.ts";

  it("leaves no observed/verified literal in the shared fixture source", () => {
    // 1254 lines feeding eighteen consumers. Its own header says
    // "replace with real Supabase queries when the data foundation goes
    // live" — until then nothing in it was observed.
    const code = read(INTEL).replace(/\/\*[\s\S]*?\*\//g, "");
    // Negative lookahead skips type positions — `confidence: "verified" |
    // "observed" | ...` is the tier vocabulary itself (category D), not a
    // claim about any value.
    expect(code).not.toMatch(/(tier|confidence): "(observed|verified)"(?!\s*\|)/);
  });

  it.each([
    "src/features/mission-control/CommandCenter.tsx",
    "src/features/vessel/Vessel.tsx",
    "src/features/ports/Ports.tsx",
    "src/features/ownership/ownership-data.ts",
    "src/features/ownership/Ownership.tsx",
    "src/features/evidence/data.ts",
    // Was `Evidence.tsx`, an unrouted duplicate of this screen that was
    // removed in Phase 5. The guard follows the surface an officer can
    // actually reach.
    "src/features/evidence/EvidenceLibrary.tsx",
    "src/features/compliance/Compliance.tsx",
  ])("%s carries no fixture-backed observed/verified claim", (path) => {
    const code = read(path).replace(/\/\*[\s\S]*?\*\//g, "");
    // Negative lookahead skips type positions — `confidence: "verified" |
    // "observed" | ...` is the tier vocabulary itself (category D), not a
    // claim about any value.
    expect(code).not.toMatch(/(tier|confidence): "(observed|verified)"(?!\s*\|)/);
  });

  it.each([
    "src/features/vessel/Vessel.tsx",
    "src/features/ports/Ports.tsx",
    /*
     * `Evidence.tsx` sat here and was removed in Phase 5 as an unrouted
     * duplicate. The guard follows the surface an officer can open.
     *
     * It differs from its neighbours in one way that matters: this one
     * shows the seed *conditionally*, because `listEvidence()` reports
     * whether its rows came from the backend or from the fixture. So the
     * notice must be bound to that fact rather than rendered outright —
     * labelling real evidence "simulated" would make officers distrust
     * genuine records. `evidence-provenance.test.ts` pins both
     * directions; this line pins that the notice exists at all.
     */
    "src/features/evidence/EvidenceLibrary.tsx",
    "src/features/ownership/Ownership.tsx",
    "src/features/compliance/Compliance.tsx",
    "src/features/mission-control/CommandCenter.tsx",
    "src/features/alerts/Alerts.tsx",
  ])("%s marks itself as simulated", (path) => {
    expect(read(path)).toContain("<DemoDataNotice");
  });
});

/* ═══════ Provider-backed claims survive ═══════ */

describe("real projection output keeps its confidence", () => {
  it.each([
    "src/features/cargo/Cargo.tsx",
    "src/features/revenue/Revenue.tsx",
    "src/features/manifest/Manifest.tsx",
  ])("%s still labels projection summaries observed", (path) => {
    // These three are the exception the audit turned up: their single
    // `observed` sits on `projection.data.summary`, gated on `hasData`,
    // falling back to `inferred` when the projection is empty. Downgrading
    // them would have understated real evidence — the reason a bulk
    // find-and-replace would have been wrong.
    const source = read(path);
    expect(source).toContain('confidence: "observed" as const');
    expect(source).toContain("hasData");
  });
});

/* ═══════ 8 & 9. Availability vocabulary stays distinct ═══════ */

describe("demo provenance does not disturb the availability states", () => {
  it("keeps no-provider distinct from no-evidence", async () => {
    const { KPI_STATE_META } = await import("@/lib/intelligence/coverage-model");
    expect(KPI_STATE_META.NO_PROVIDER.label).not.toBe(KPI_STATE_META.NO_EVIDENCE.label);
    expect(KPI_STATE_META.NO_PROVIDER.dot).not.toBe(KPI_STATE_META.NO_EVIDENCE.dot);
  });

  it("keeps provider-offline an alarm and no-provider not", async () => {
    const { KPI_STATE_META } = await import("@/lib/intelligence/coverage-model");
    expect(KPI_STATE_META.PROVIDER_OFFLINE.tone).toBe("bad");
    expect(KPI_STATE_META.NO_PROVIDER.tone).toBe("neutral");
  });
});

/* ═══════ 10. The build guard actually guards ═══════ */

describe("the production bundle scan covers these claims", () => {
  const script = read("scripts/verify-prod-bundle.mjs");

  it("checks for observed/verified fixture confidence", () => {
    expect(script).toContain('confidence:"observed"');
    expect(script).toContain('confidence:"verified"');
  });

  it("checks for the bare fixture IMOs", () => {
    for (const imo of ["9432187", "9187562", "9722145", "9601028"]) {
      expect(script).toContain(imo);
    }
  });

  it("is wired into validate, not left as a script nobody runs", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["verify:bundle"]).toBeTruthy();
    expect(pkg.scripts.validate).toContain("verify:bundle");
  });
});
