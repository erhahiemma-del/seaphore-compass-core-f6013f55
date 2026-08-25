/**
 * Visual semantics of data availability.
 *
 * The rule these encode: an unconfigured source must never look like an
 * operational alert. Red is reserved for something that is actually
 * wrong, because an officer who sees red for routine configuration
 * learns to stop reading red at all.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { KPI_STATE_META, type KpiStateCode } from "@/lib/intelligence/coverage-model";

const ALARM_TONES = ["bad"];
const ALARM_DOTS = ["🔴", "🟥"];

/* ═══════ 1 & 6. Missing provider is not an alert ═══════ */

describe("NO_PROVIDER does not render as a critical operational alert", () => {
  const meta = KPI_STATE_META.NO_PROVIDER;

  it("carries a neutral tone", () => {
    expect(ALARM_TONES).not.toContain(meta.tone);
    expect(meta.tone).toBe("neutral");
  });

  it("carries no alarm glyph", () => {
    expect(ALARM_DOTS).not.toContain(meta.dot);
  });

  it("says what is missing without implying failure", () => {
    expect(meta.label).toBe("Data source not connected");
    // "Error", "failed" and "offline" would all describe a fault that has
    // not occurred.
    expect(meta.label.toLowerCase()).not.toMatch(/error|fail|offline|critical/);
  });
});

/* ═══════ 2. NO_EVIDENCE ≠ NO_PROVIDER ═══════ */

describe("no-evidence stays distinguishable from no-provider", () => {
  const evidence = KPI_STATE_META.NO_EVIDENCE;
  const provider = KPI_STATE_META.NO_PROVIDER;

  it("uses different labels", () => {
    expect(evidence.label).not.toBe(provider.label);
  });

  it("uses different glyphs", () => {
    // Both are calm, but "we looked and found nothing" and "we never
    // looked" are different facts and must not collapse into one dot.
    expect(evidence.dot).not.toBe(provider.dot);
  });

  it("neither is an alarm", () => {
    for (const meta of [evidence, provider]) {
      expect(ALARM_TONES).not.toContain(meta.tone);
    }
  });
});

/* ═══════ 5. Genuine faults keep priority ═══════ */

describe("real faults retain stronger treatment than missing configuration", () => {
  it("PROVIDER_OFFLINE remains an alarm", () => {
    // The contrast that gives red its meaning: a provider we rely on
    // stopped answering.
    expect(KPI_STATE_META.PROVIDER_OFFLINE.tone).toBe("bad");
    expect(KPI_STATE_META.PROVIDER_OFFLINE.dot).toBe("🔴");
  });

  it("DASHBOARD_MAPPING_ERROR remains an alarm", () => {
    expect(KPI_STATE_META.DASHBOARD_MAPPING_ERROR.tone).toBe("bad");
  });

  it("outranks NO_PROVIDER", () => {
    expect(KPI_STATE_META.PROVIDER_OFFLINE.tone).not.toBe(KPI_STATE_META.NO_PROVIDER.tone);
  });

  it("reserves the bad tone for actual faults", () => {
    const bad = (Object.keys(KPI_STATE_META) as KpiStateCode[]).filter(
      (code) => KPI_STATE_META[code].tone === "bad",
    );
    expect(bad.sort()).toEqual(["DASHBOARD_MAPPING_ERROR", "PROVIDER_OFFLINE"]);
  });
});

/* ═══════ Every state stays legible ═══════ */

describe("the state table remains coherent", () => {
  const codes = Object.keys(KPI_STATE_META) as KpiStateCode[];

  it("gives every state a label and a glyph", () => {
    for (const code of codes) {
      expect(KPI_STATE_META[code].label.length).toBeGreaterThan(0);
      expect(KPI_STATE_META[code].dot.length).toBeGreaterThan(0);
    }
  });

  it("keeps ACTIVE the only good tone", () => {
    const good = codes.filter((code) => KPI_STATE_META[code].tone === "good");
    // Nothing else may read as "all is well" — least of all an absence.
    expect(good).toEqual(["ACTIVE"]);
  });
});

/* ═══════ Surface-level consistency ═══════ */

describe("surfaces agree with the shared table", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("the readiness card does not paint awaiting-credentials as an outage", () => {
    const source = read("src/components/intelligence/IntelligenceReadinessCard.tsx");
    expect(source).not.toMatch(/tone="critical"\s+title="Awaiting Credentials"/);
    expect(source).toMatch(/tone="review"\s+title="Awaiting Credentials"/);
  });

  it("the readiness card marks a real outage red", () => {
    expect(read("src/components/intelligence/IntelligenceReadinessCard.tsx")).toMatch(
      /tone="critical"\s+title="Offline"/,
    );
  });

  it("an unregistered provider is not shown as a fault", () => {
    const source = read("src/components/intelligence/KpiCoverageCard.tsx");
    expect(source).not.toContain('NOT_REGISTERED: "🔴');
  });

  it("Mission Control only pulses when the feed is genuinely live", () => {
    const source = read("src/features/mission-control/MissionControl.tsx");
    const pulses = source.match(/animate-pulse/g) ?? [];
    // Exactly one, and it is gated on the resolved live state.
    expect(pulses.length).toBe(1);
    expect(source).toMatch(/state\.isLive && "animate-pulse"/);
  });
});
