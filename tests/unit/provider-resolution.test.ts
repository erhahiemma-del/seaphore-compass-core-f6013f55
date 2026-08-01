/**
 * Sprint EP-01A — Provider Resolution regression suite.
 *
 * Guarantees: one capability = one active provider; environment-aware
 * selection; disabled providers ignored; health failover; graceful
 * "no provider" outcome; ConnectorManager executes exactly one provider.
 */
import { describe, expect, it } from "vitest";

import { ConnectorManager } from "@/services/ial/manager";
import { resolveProvider } from "@/services/ial/connectors/resolver";
import type { Connector, ConnectorCapability } from "@/services/ial/connectors/base";
import type {
  AcquisitionQuery,
  ConnectorHealth,
  ConnectorId,
  ConnectorResult,
} from "@/services/ial/types";

const CAP: ConnectorCapability = "SANCTIONS";

function makeProvider(id: string, provider: Connector["provider"], calls?: string[]): Connector {
  return {
    id: id as ConnectorId,
    displayName: id,
    capabilities: [CAP],
    provider,
    async connect() {},
    async authenticate() {
      return true;
    },
    async search(query: AcquisitionQuery): Promise<ConnectorResult> {
      calls?.push(id);
      return {
        connectorId: id as ConnectorId,
        ok: true,
        records: [],
        latencyMs: 1,
        ...(query ? {} : {}),
      };
    },
    async lookup(query: AcquisitionQuery): Promise<ConnectorResult> {
      return this.search(query);
    },
    normalize() {
      return null;
    },
    async healthCheck(): Promise<ConnectorHealth> {
      return {
        connectorId: id as ConnectorId,
        available: true,
        authenticated: true,
        latencyMsP50: 1,
        failureRate: 0,
        quotaRemaining: null,
        lastSuccessAt: null,
        lastError: null,
      };
    },
  };
}

const sim = () =>
  makeProvider("sanctions-sim", {
    providerType: "SIMULATOR",
    priority: 10,
    environment: "development",
    enabled: true,
  });
const live = () =>
  makeProvider("sanctions-live", {
    providerType: "LIVE",
    priority: 100,
    environment: "both",
    enabled: true,
  });

describe("Provider Resolver — one capability, one provider", () => {
  it("development resolves the simulator", () => {
    const r = resolveProvider(CAP, [live(), sim()], { environment: "development" });
    expect(r.provider?.id).toBe("sanctions-sim");
    expect(r.chain.length).toBeGreaterThan(0);
  });

  it("production resolves the live provider", () => {
    const r = resolveProvider(CAP, [live(), sim()], { environment: "production" });
    expect(r.provider?.id).toBe("sanctions-live");
    expect(
      r.rejected.some((x) => x.id === "sanctions-sim" && x.reason === "environment-mismatch"),
    ).toBe(true);
  });

  it("ignores disabled providers", () => {
    const disabled = makeProvider("sanctions-sim", {
      providerType: "SIMULATOR",
      priority: 10,
      environment: "development",
      enabled: false,
    });
    const r = resolveProvider(CAP, [disabled, live()], { environment: "development" });
    expect(r.provider?.id).toBe("sanctions-live");
    expect(r.rejected.some((x) => x.id === "sanctions-sim" && x.reason === "disabled")).toBe(true);
  });

  it("explicit override wins", () => {
    const r = resolveProvider(CAP, [live(), sim()], {
      environment: "development",
      override: "sanctions-live",
    });
    expect(r.rule).toBe("override");
    expect(r.provider?.id).toBe("sanctions-live");
  });

  it("fails over to the same-capability provider when unhealthy", () => {
    const r = resolveProvider(CAP, [live(), sim()], {
      environment: "development",
      isHealthy: (c) => c.id !== "sanctions-sim",
    });
    expect(r.provider?.id).toBe("sanctions-live");
    expect(r.rejected.some((x) => x.id === "sanctions-sim" && x.reason === "unhealthy")).toBe(true);
  });

  it("returns a graceful null when no provider is available", () => {
    const r = resolveProvider(CAP, [], { environment: "production" });
    expect(r.provider).toBeNull();
    expect(r.rule).toBe("none");
    expect(r.reason).toContain("No provider");
  });

  it("never resolves more than one provider by default", () => {
    const r = resolveProvider(CAP, [live(), sim(), makeProvider("extra", undefined)], {
      environment: "production",
    });
    expect(r.provider).not.toBeNull();
    expect([r.provider!.id].length).toBe(1);
  });
});

describe("ConnectorManager — executes exactly one provider per capability", () => {
  it("resolveActiveProviderIds returns a single id", () => {
    const mgr = new ConnectorManager();
    mgr.register(live());
    mgr.register(sim());
    expect(mgr.resolveActiveProviderIds(CAP, { environment: "production" })).toEqual([
      "sanctions-live",
    ]);
    expect(mgr.resolveActiveProviderIds(CAP, { environment: "development" })).toEqual([
      "sanctions-sim",
    ]);
  });

  it("acquisition calls only the resolved provider", async () => {
    const calls: string[] = [];
    const mgr = new ConnectorManager();
    mgr.register(makeProvider("sanctions-live", live().provider, calls));
    mgr.register(makeProvider("sanctions-sim", sim().provider, calls));
    const ids = mgr.resolveActiveProviderIds(CAP, { environment: "production" });
    await mgr.acquire({ text: "Blue Horizon Holdings", kinds: ["sanctions"], connectors: ids });
    expect(calls).toEqual(["sanctions-live"]);
  });
});
