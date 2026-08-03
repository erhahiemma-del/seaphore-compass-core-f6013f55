/**
 * Sprint EP-GOV-01 — Government Maritime Evidence Provider.
 * Certification, adapter isolation, confidence model and honesty.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { certifyProvider } from "@/connectors/framework/certification";
import {
  GovernmentMaritimeProvider,
  governmentMaritimeProvider,
} from "@/connectors/implementations/GovernmentMaritimeProvider";
import { GOVERNMENT_ADAPTERS } from "@/services/government/adapters";
import { scoreGovernmentRecord } from "@/services/government/confidence";
import type { GovernmentEvidenceRecord } from "@/services/government/types";

const SOURCE = readFileSync(
  "src/connectors/implementations/GovernmentMaritimeProvider.ts",
  "utf8",
);

const declaration: GovernmentEvidenceRecord = {
  agency: "NCS",
  agencyName: "Nigeria Customs Service (NICIS II)",
  recordType: "customs-declaration",
  recordId: "ncs:sad:C-1001",
  label: "SAD C-1001",
  occurredAt: new Date().toISOString(),
  fields: {
    declarationNumber: "C-1001",
    declarationStatus: "RELEASED",
    importerName: "Delta Trading Ltd",
  },
  links: { billOfLading: "BL-9001" },
  raw: { sad_number: "C-1001" },
};

describe("Government Maritime Evidence Provider", () => {
  it("passes Evidence Provider Specification v1.0 certification", () => {
    const report = certifyProvider(governmentMaritimeProvider, {
      source: SOURCE,
      className: "GovernmentMaritimeProvider",
    });
    expect(report.failures.map((f) => `${f.id}: ${f.detail ?? ""}`)).toEqual([]);
    expect(report.certified).toBe(true);
  });

  it("declares CAPABILITY.CARGO", () => {
    expect(governmentMaritimeProvider.capabilities).toContain("CARGO");
  });

  it("reports awaiting-credentials honestly instead of simulating evidence", async () => {
    const provider = new GovernmentMaritimeProvider({ adapters: GOVERNMENT_ADAPTERS, config: {} });
    const result = await provider.search({ text: "BL-9001" });
    expect(result.ok).toBe(false);
    expect(result.records).toHaveLength(0);
    expect(result.error).toMatch(/configured/i);
    expect(provider.agencyStatuses.every((s) => s.reason?.includes("Awaiting credentials"))).toBe(
      true,
    );
  });

  it("acquires canonical cargo evidence through a configured adapter", async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("/declarations")) {
        return new Response(JSON.stringify({ data: [{ sad_number: "C-1001", status: "RELEASED", importer_name: "Delta Trading Ltd", declaration_date: declaration.occurredAt, bill_of_lading: "BL-9001" }] }), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;

    const provider = new GovernmentMaritimeProvider({
      adapters: [GOVERNMENT_ADAPTERS[0]],
      fetchImpl,
      config: {
        NCS_CUSTOMS_API_BASE_URL: "https://gov.example/api",
        NCS_CUSTOMS_API_TOKEN: "token",
      },
    });
    const result = await provider.search({ text: "C-1001" });
    expect(result.ok).toBe(true);
    expect(result.records.length).toBeGreaterThan(0);
    const evidence = result.records[0];
    expect(evidence.source).toBe("gov-maritime");
    expect(evidence.entity.kind).toBe("cargo");
    expect(provider.lineageFor(evidence.id)?.chain.length).toBe(7);
    expect(provider.confidenceFor(evidence.id)?.grade).toBeTruthy();
  });

  it("grades a complete, fresh, corroborated authority record VERIFIED", () => {
    const scored = scoreGovernmentRecord(declaration, {
      trustWeight: 1,
      corroborationCount: 2,
    });
    expect(scored.grade).toBe("VERIFIED");
    expect(scored.missingFields).toEqual([]);
  });

  it("downgrades an incomplete record and explains why", () => {
    const thin: GovernmentEvidenceRecord = {
      ...declaration,
      fields: { declarationNumber: "C-1002" },
    };
    const scored = scoreGovernmentRecord(thin, { trustWeight: 1, corroborationCount: 0 });
    expect(scored.grade).not.toBe("VERIFIED");
    expect(scored.missingFields).toContain("importerName");
    expect(scored.rationale).toMatch(/missing/);
  });

  it("keeps every agency behind an adapter with declared record types", () => {
    for (const adapter of GOVERNMENT_ADAPTERS) {
      expect(adapter.recordTypes.length).toBeGreaterThan(0);
      expect(adapter.baseUrlEnv.length).toBeGreaterThan(0);
      expect(adapter.credentialEnv.length).toBeGreaterThan(0);
    }
    expect(GOVERNMENT_ADAPTERS.map((a) => a.agency)).toEqual(["NCS", "NIMASA", "NPA"]);
  });
});
