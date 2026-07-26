import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  certifyProvider,
  formatCertificationReport,
  registerCertifiedProvider,
  ProviderCertificationError,
  EVIDENCE_PROVIDER_SPEC_VERSION,
  FROZEN_PROVIDER_API,
  type RegistrarTarget,
} from "../index";
import { ConnectorRegistry } from "@/services/ial/connectors/registry";
import { resolveProvider } from "@/services/ial/connectors/resolver";
import { openSanctionsConnector } from "../../implementations/OpenSanctionsConnector";
import { environmentalIntelligenceProvider } from "../../implementations/EnvironmentalIntelligenceProvider";
import type { Connector } from "@/services/ial/connectors/base";

const ROOT = process.cwd();
function source(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const PROVIDERS = [
  {
    name: "OpenSanctions",
    provider: openSanctionsConnector,
    file: "src/connectors/implementations/OpenSanctionsConnector.ts",
  },
  {
    name: "Environmental Intelligence",
    provider: environmentalIntelligenceProvider,
    file: "src/connectors/implementations/EnvironmentalIntelligenceProvider.ts",
  },
];

/** Minimal spec-compliant provider used for negative certification cases. */
function makeValidProvider(overrides: Partial<Record<string, unknown>> = {}): Connector {
  const base = {
    id: "test-provider",
    displayName: "Test Provider",
    specVersion: EVIDENCE_PROVIDER_SPEC_VERSION,
    projectionContractId: "ial.opensanctions-evidence-provider",
    capabilities: ["SANCTIONS"],
    provider: { providerType: "TEST", priority: 1, environment: "development", enabled: true },
    connect: async () => {},
    authenticate: async () => true,
    search: async () => ({ connectorId: "test-provider", ok: true, records: [], latencyMs: 0 }),
    lookup: async () => ({ connectorId: "test-provider", ok: true, records: [], latencyMs: 0 }),
    normalize: () => null,
    validate: () => ({ issues: [] }),
    healthCheck: async () => ({
      connectorId: "test-provider",
      available: true,
      authenticated: true,
      latencyMsP50: 0,
      failureRate: 0,
      quotaRemaining: null,
      lastSuccessAt: null,
      lastError: null,
    }),
  } as Record<string, unknown>;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base as unknown as Connector;
}

describe("PF-01 · Evidence Provider Specification v1.0", () => {
  it("freezes the public provider API to five methods", () => {
    expect([...FROZEN_PROVIDER_API]).toEqual([
      "connect",
      "healthCheck",
      "search",
      "normalize",
      "validate",
    ]);
  });

  it.each(PROVIDERS)("$name declares specVersion 1.0", ({ provider }) => {
    expect((provider as unknown as { specVersion: string }).specVersion).toBe("1.0");
  });
});

describe("PF-01 · Certification Framework", () => {
  it.each(PROVIDERS)("$name passes certification", ({ provider, file }) => {
    const report = certifyProvider(provider, { source: source(file) });
    if (!report.certified) throw new Error(formatCertificationReport(report));
    expect(report.certified).toBe(true);
  });

  it("certifies OpenSanctions as the reference provider", () => {
    const report = certifyProvider(openSanctionsConnector, {
      source: source("src/connectors/implementations/OpenSanctionsConnector.ts"),
    });
    expect(report.providerId).toBe("open-sanctions");
    expect(report.specVersion).toBe("1.0");
    expect(report.certified).toBe(true);
  });

  it("rejects invalid metadata", () => {
    const report = certifyProvider(makeValidProvider({ displayName: "" }), { allowSkipped: true });
    expect(report.certified).toBe(false);
    expect(report.failures.map((f) => f.id)).toContain("metadata");
  });

  it("rejects duplicate provider IDs", () => {
    const report = certifyProvider(makeValidProvider(), {
      allowSkipped: true,
      existingIds: ["test-provider"],
    });
    expect(report.failures.map((f) => f.id)).toContain("unique-id");
  });

  it("rejects a missing capability", () => {
    const report = certifyProvider(makeValidProvider({ capabilities: [] }), { allowSkipped: true });
    expect(report.failures.map((f) => f.id)).toContain("capabilities");
  });

  it("rejects a missing health check", () => {
    const report = certifyProvider(makeValidProvider({ healthCheck: undefined }), {
      allowSkipped: true,
    });
    expect(report.failures.map((f) => f.id)).toContain("method-healthCheck");
  });

  it("rejects a missing normalize()", () => {
    const report = certifyProvider(makeValidProvider({ normalize: undefined }), {
      allowSkipped: true,
    });
    expect(report.failures.map((f) => f.id)).toContain("method-normalize");
  });

  it("rejects a missing validate()", () => {
    const report = certifyProvider(makeValidProvider({ validate: undefined }), {
      allowSkipped: true,
    });
    expect(report.failures.map((f) => f.id)).toContain("method-validate");
  });

  it("rejects a missing Projection Contract", () => {
    const report = certifyProvider(makeValidProvider({ projectionContractId: undefined }), {
      allowSkipped: true,
    });
    expect(report.failures.map((f) => f.id)).toContain("projection-contract");
  });

  it("rejects a provider whose source persists or imports Supabase", () => {
    const badSource = [
      'import { supabase } from "@/integrations/supabase/client";',
      "class Provider {",
      "  async search() { return {} as ConnectorResult; }",
      "}",
    ].join("\n");
    const report = certifyProvider(makeValidProvider(), { source: badSource });
    const ids = report.failures.map((f) => f.id);
    expect(ids).toContain("no-supabase");
    expect(ids).toContain("uses-cache");
  });

  it("blocks registration when certification fails", () => {
    const registry = new ConnectorRegistry();
    const target: RegistrarTarget = { register: (c) => registry.register(c) };
    expect(() =>
      registerCertifiedProvider(target, makeValidProvider({ capabilities: [] }), {
        allowSkipped: true,
      }),
    ).toThrow(ProviderCertificationError);
    expect(registry.getAll()).toHaveLength(0);
  });

  it("registers a certified provider on the existing registry", () => {
    const registry = new ConnectorRegistry();
    const target: RegistrarTarget = { register: (c) => registry.register(c) };
    const report = registerCertifiedProvider(target, makeValidProvider(), { allowSkipped: true });
    expect(report.certified).toBe(true);
    expect(registry.has("test-provider")).toBe(true);
  });
});

describe("PF-01 · Provider Resolver compatibility", () => {
  it("still resolves exactly one provider per capability", () => {
    const registry = new ConnectorRegistry();
    registry.register(openSanctionsConnector);
    registry.register(environmentalIntelligenceProvider);
    const sanctions = resolveProvider(registry, "SANCTIONS", { environment: "production" });
    expect(sanctions.selected?.id).toBe("open-sanctions");
    const env = resolveProvider(registry, "ENVIRONMENTAL_INTELLIGENCE", {
      environment: "production",
    });
    expect(env.selected?.id).toBe(environmentalIntelligenceProvider.id);
  });
});
