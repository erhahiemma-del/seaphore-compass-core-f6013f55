/**
 * Sprint EP-01 — OpenSanctions Evidence Provider tests.
 *
 * Every test injects a stub `fetchImpl`; no network call is made.
 */
import { describe, expect, it, vi } from "vitest";
import { EvidenceCache } from "@/services/ial/cache";
import { validateRecords } from "@/services/ial/validator";
import { ConnectorRegistry } from "@/services/ial/connectors/registry";
import {
  OPEN_SANCTIONS_METADATA,
  OpenSanctionsConnector,
} from "../implementations/OpenSanctionsConnector";
import { registerEvidenceProviders } from "../index";
import { ConnectorManager } from "@/services/ial/manager";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const VESSEL_HIT = {
  results: [
    {
      id: "NK-vessel-1",
      caption: "OCEAN PEARL",
      schema: "Vessel",
      score: 0.91,
      last_change: "2026-07-01T00:00:00.000Z",
      datasets: ["us_ofac_sdn", "eu_fsf"],
      properties: {
        name: ["OCEAN PEARL"],
        alias: ["OCEAN PRL"],
        country: ["ir"],
        imoNumber: ["9438291"],
        program: ["SDGT"],
        startDate: ["2024-02-01"],
      },
    },
  ],
};

describe("OpenSanctionsConnector — metadata", () => {
  it("declares Tier-1 provider metadata", () => {
    expect(OPEN_SANCTIONS_METADATA.id).toBe("open-sanctions");
    expect(OPEN_SANCTIONS_METADATA.tier).toBe(1);
    // Sprint OPS-01: the hosted API rejects anonymous search (HTTP 401).
    expect(OPEN_SANCTIONS_METADATA.requiresAuth).toBe(true);
    expect(OPEN_SANCTIONS_METADATA.entityTypes).toContain("VESSEL");
    expect(OPEN_SANCTIONS_METADATA.fieldCategories).toContain("SANCTIONS");
  });
});

describe("OpenSanctionsConnector — connect()", () => {
  it("authenticates on HTTP 200 when a key is configured", async () => {
    process.env.OPENSANCTIONS_API_KEY = "test-key";
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => jsonResponse({ status: "ok" })) as unknown as typeof fetch,
    });
    await c.connect();
    expect(await c.authenticate()).toBe(true);
    delete process.env.OPENSANCTIONS_API_KEY;
  });

  it("reports a Configuration Error, not offline, when the key is missing", async () => {
    delete process.env.OPENSANCTIONS_API_KEY;
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => jsonResponse({ status: "ok" })) as unknown as typeof fetch,
    });
    expect(await c.authenticate()).toBe(false);
    const h = await c.healthCheck();
    // Reachable host: the provider is NOT offline, it is unconfigured.
    expect(h.available).toBe(true);
    expect(h.lastError).toMatch(/Configuration Error/i);
    expect(h.lastError).toMatch(/OPENSANCTIONS_API_KEY/);
  });

  it("classifies a 404 base path as Invalid Endpoint", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => jsonResponse({ detail: "Not Found" }, 404)) as unknown as typeof fetch,
    });
    expect(await c.authenticate()).toBe(false);
    const h = await c.healthCheck();
    expect(h.lastError).toMatch(/Invalid Endpoint/i);
  });

  it("reports unavailable on non-200", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => jsonResponse({}, 503)) as unknown as typeof fetch,
    });
    expect(await c.authenticate()).toBe(false);
    const h = await c.healthCheck();
    expect(h.available).toBe(false);
  });

  it("reports unavailable on network failure", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(await c.authenticate()).toBe(false);
  });
});

describe("OpenSanctionsConnector — search()", () => {
  it("returns a valid EvidencePackage-ready result", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(VESSEL_HIT));
    const c = new OpenSanctionsConnector({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await c.search({ text: "Ocean Pearl", kinds: ["sanctions"] });

    expect(res.ok).toBe(true);
    expect(res.connectorId).toBe("open-sanctions");
    expect(res.records).toHaveLength(1);
    const rec = res.records[0];
    expect(rec.source).toBe("open-sanctions");
    expect(rec.sourceName).toBe("OpenSanctions");
    expect(rec.kind).toBe("sanctions");
    expect(rec.fields.entityName).toBe("OCEAN PEARL");
    expect(rec.fields.sanctionLists).toContain("us_ofac_sdn");
    expect(rec.fields.sanctionPrograms).toContain("SDGT");
    expect(rec.hash).toBeTruthy();
    expect(rec.fields.rawHash).toBeTruthy();
    expect(rec.fields.evidenceUrl).toContain("opensanctions.org");
  });

  it("maps vessel IMO to a canonical vessel entity id", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => jsonResponse(VESSEL_HIT)) as unknown as typeof fetch,
    });
    const res = await c.search({ text: "Ocean Pearl" });
    expect(res.records[0].entity.kind).toBe("vessel");
    expect(res.records[0].entity.id).toBe("vessel:imo:9438291");
    expect(res.records[0].fields.imoNumber).toBe("9438291");
  });

  it("passes the framework validator with no errors", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => jsonResponse(VESSEL_HIT)) as unknown as typeof fetch,
    });
    const res = await c.search({ text: "Ocean Pearl" });
    const { issues } = validateRecords(res.records);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("returns an empty package for an empty API response", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => jsonResponse({ results: [] })) as unknown as typeof fetch,
    });
    const res = await c.search({ text: "Nonexistent Vessel" });
    expect(res.ok).toBe(true);
    expect(res.records).toHaveLength(0);
  });

  it("returns an empty result for a blank query without calling the API", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(VESSEL_HIT));
    const c = new OpenSanctionsConnector({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await c.search({ text: "   " });
    expect(res.records).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("handles timeouts gracefully", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async (_url: unknown, init?: RequestInit) => {
        const err = new Error("aborted");
        err.name = "AbortError";
        void init;
        throw err;
      }) as unknown as typeof fetch,
    });
    const res = await c.search({ text: "Ocean Pearl" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/^Timeout — /);
    expect(res.records).toHaveLength(0);
  });

  it("rejects malformed JSON cleanly", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(
        async () =>
          new Response("<html>not json</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      ) as unknown as typeof fetch,
    });
    const res = await c.search({ text: "Ocean Pearl" });
    expect(res.ok).toBe(false);
    expect(res.records).toHaveLength(0);
  });

  it("surfaces non-200 search responses as failures", async () => {
    const c = new OpenSanctionsConnector({
      fetchImpl: vi.fn(async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    });
    const res = await c.search({ text: "Ocean Pearl" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("429");
  });
});

describe("OpenSanctionsConnector — cache", () => {
  it("cache hit avoids the API call", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(VESSEL_HIT));
    const c = new OpenSanctionsConnector({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await c.search({ text: "Ocean Pearl" });
    await c.search({ text: "Ocean Pearl" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cache expiry refreshes the package after 24h", async () => {
    let now = 1_800_000_000_000;
    const clock = () => now;
    const fetchImpl = vi.fn(async () => jsonResponse(VESSEL_HIT));
    const c = new OpenSanctionsConnector({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cache: new EvidenceCache({ defaultTtlMs: 24 * 3600_000, clock }),
      clock,
    });
    await c.search({ text: "Ocean Pearl" });
    now += 24 * 3600_000 + 1_000;
    await c.search({ text: "Ocean Pearl" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("forceRefresh bypasses the cache", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(VESSEL_HIT));
    const c = new OpenSanctionsConnector({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await c.search({ text: "Ocean Pearl" });
    await c.search({ text: "Ocean Pearl", forceRefresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("OpenSanctionsConnector — registration & architecture", () => {
  it("registers into the existing Connector Registry", () => {
    const registry = new ConnectorRegistry();
    const mgr = new ConnectorManager({ registry });
    registerEvidenceProviders(mgr);
    expect(registry.get("open-sanctions")).toBeDefined();
    expect(registry.getByCapability("SANCTIONS").map((c) => c.id)).toContain(
      "open-sanctions",
    );
    expect(registry.getByEntityType("vessel").map((c) => c.id)).toContain(
      "open-sanctions",
    );
  });

  it("performs no database writes (no persistence imports)", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "src/connectors/implementations/OpenSanctionsConnector.ts",
        "utf8",
      ),
    );
    // Strip comments so documentation of the prohibitions does not
    // trip the guard — only executable code is inspected.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const imports = code.match(/^import .*$/gm)?.join("\n") ?? "";
    expect(imports).not.toMatch(/supabase/i);
    expect(code).not.toMatch(/registerUip\(/);
    expect(code).not.toMatch(/\.from\(["']/);
    expect(code).not.toMatch(/resolveIdentity\(|registerEntity\(/);

  });
});

