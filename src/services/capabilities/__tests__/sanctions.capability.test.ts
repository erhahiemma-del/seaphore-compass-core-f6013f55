/**
 * Sprint 1A.3 — SANCTIONS capability tests.
 *
 * These tests verify BEHAVIOUR, not implementation: they never name a
 * provider. Multiple sanctions providers should coexist and both be
 * selected purely via `getByCapability("SANCTIONS")`.
 */
import { describe, expect, it } from "vitest";

import {
  ConnectorManager,
  SimulatedOpenSanctionsConnector,
  canonicalEntityId,
  normalizeRecord,
} from "@/services/ial";
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
  NormalizedEvidence,
} from "@/services/ial";
import type { Connector, ConnectorCapability } from "@/services/ial";
import { runSanctionsScreening, SANCTIONS_FOLLOW_UPS } from "../sanctions";

/** Minimal second SANCTIONS provider — proves providers are pluggable. */
class MockOfacConnector implements Connector {
  readonly id: ConnectorId = "ofac" as ConnectorId;
  readonly displayName = "OFAC (Mock)";
  readonly capabilities: ReadonlyArray<ConnectorCapability> = [
    "SANCTIONS",
    "COMPANY_SCREENING",
    "VESSEL_SCREENING",
  ];
  async connect() {}
  async authenticate() {
    return true;
  }
  async search(q: AcquisitionQuery): Promise<ConnectorResult> {
    return this.run(q);
  }
  async lookup(q: AcquisitionQuery): Promise<ConnectorResult> {
    return this.run(q);
  }
  normalize(raw: unknown): NormalizedEvidence | null {
    return raw as NormalizedEvidence;
  }
  async healthCheck(): Promise<ConnectorHealth> {
    return {
      connectorId: this.id,
      available: true,
      authenticated: true,
      latencyMsP50: 25,
      failureRate: 0,
      quotaRemaining: null,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
    };
  }
  private async run(q: AcquisitionQuery): Promise<ConnectorResult> {
    const label = q.entity?.label ?? q.text ?? "unknown";
    const record = normalizeRecord({
      source: this.id,
      sourceName: this.displayName,
      grade: "VERIFIED",
      entity: {
        kind: q.entity?.kind ?? "company",
        nativeId: q.entity?.id ?? label,
        label,
      },
      kind: "sanctions",
      fields: {
        name: label,
        listName: "OFAC-SDN",
        sanctionLists: ["OFAC-SDN"],
        programs: [],
        countries: [],
        aliases: [],
        evidenceUrl: "https://sanctionssearch.ofac.treas.gov/",
        lastUpdated: new Date().toISOString(),
        confidence: 0.9,
        match: "none",
      },
      observedAt: new Date(),
      excerpt: "OFAC no-match",
    });
    return { connectorId: this.id, ok: true, records: [record], latencyMs: 3 };
  }
}

function buildManager(withOfac = false): ConnectorManager {
  const mgr = new ConnectorManager();
  mgr.register(new SimulatedOpenSanctionsConnector());
  if (withOfac) mgr.register(new MockOfacConnector());
  return mgr;
}

describe("Capability: SANCTIONS", () => {
  it("advertises SANCTIONS via capability metadata", () => {
    const mgr = buildManager();
    const providers = mgr.getByCapability("SANCTIONS");
    expect(providers.length).toBe(1);
  });

  it("returns an EvidencePackage with a sanctions record for a vessel target", async () => {
    const mgr = buildManager();
    await mgr.warmup();
    const result = await runSanctionsScreening({
      manager: mgr,
      target: { kind: "vessel", name: "MV Ocean Pearl", imo: "9438291" },
    });

    expect(result.capability).toBe("SANCTIONS");
    expect(result.providers.length).toBeGreaterThan(0);
    expect(result.package.id).toMatch(/^pkg_/);
    const sanctions = result.package.verified.filter((r) => r.kind === "sanctions");
    expect(sanctions.length).toBeGreaterThan(0);

    // Canonical fields populated (behaviour, not implementation).
    const rec = sanctions[0];
    expect(rec.entity.id).toBe(canonicalEntityId("vessel", "9438291"));
    expect(rec.fields.name).toBeTruthy();
    expect(rec.fields.evidenceUrl).toBeTruthy();
    expect(rec.fields.confidence).toBeGreaterThan(0);
    expect(["none", "positive"]).toContain(rec.fields.match as string);
  });

  it("returns a positive match for a known sanctioned entity", async () => {
    const mgr = buildManager();
    await mgr.warmup();
    const result = await runSanctionsScreening({
      manager: mgr,
      target: { kind: "company", name: "Sanctioned Test Corp" },
    });
    const rec = result.package.verified.find((r) => r.kind === "sanctions");
    expect(rec).toBeDefined();
    expect(rec?.fields.match).toBe("positive");
    expect(Array.isArray(rec?.fields.sanctionLists)).toBe(true);
  });

  it("resolves exactly ONE SANCTIONS provider (Sprint EP-01A)", async () => {
    const mgr = buildManager(true);
    await mgr.warmup();

    // Discovery still sees every registered provider…
    expect(mgr.getByCapability("SANCTIONS").length).toBe(2);
    // …but resolution activates exactly one.
    expect(mgr.resolveActiveProviderIds("SANCTIONS").length).toBe(1);

    const result = await runSanctionsScreening({
      manager: mgr,
      target: { kind: "vessel", name: "MV Ocean Pearl", imo: "9438291" },
    });

    expect(result.providers.length).toBe(1);
    const sources = new Set(
      result.package.verified.filter((r) => r.kind === "sanctions").map((r) => r.source),
    );
    // Hybrid execution is eliminated: a single provider contributed.
    expect(sources.size).toBeLessThanOrEqual(1);
  });

  it("emits the fixed follow-up prompts owned by the capability", async () => {
    const mgr = buildManager();
    await mgr.warmup();
    const result = await runSanctionsScreening({
      manager: mgr,
      target: { name: "OceanLine Shipping SA" },
    });
    expect(result.followUps).toEqual(SANCTIONS_FOLLOW_UPS);
    expect(result.followUps).toContain("Screen beneficial owner.");
    expect(result.followUps).toContain("Generate compliance report.");
  });
});
