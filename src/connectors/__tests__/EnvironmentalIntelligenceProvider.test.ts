/**
 * Sprint EP-02 — Environmental Intelligence Provider tests.
 *
 * Every test injects a stub `fetchImpl` and an injected clock; no
 * network call is made and no wall-clock dependency exists.
 *
 * The suite also asserts the ARCHITECTURE FREEZE: the provider source
 * file must contain no persistence, no identity resolution, no UIP
 * creation, and no reasoning verdicts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EvidenceCache } from "@/services/ial/cache";
import { validateRecords } from "@/services/ial/validator";
import { ConnectorRegistry } from "@/services/ial/connectors/registry";
import { resolveProvider } from "@/services/ial/connectors/resolver";
import { ConnectorManager } from "@/services/ial/manager";
import {
  ENVIRONMENTAL_CACHE_TTL_MS,
  ENVIRONMENTAL_INTELLIGENCE_METADATA,
  EnvironmentalIntelligenceProvider,
  OpenMeteoMarineAdapter,
  acquisitionConfidence,
  validateRequest,
  type EnvironmentalRequest,
  type EnvironmentalSourceAdapter,
} from "../implementations/EnvironmentalIntelligenceProvider";
import { registerEvidenceProviders } from "../index";

// ── fixtures ────────────────────────────────────────────────────────

const AT = "2026-07-26T12:00:00.000Z";
const NOW = Date.parse(AT);
const LAGOS: EnvironmentalRequest = {
  latitude: 6.45,
  longitude: 3.38,
  portCode: "NGLOS",
  investigationTime: AT,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const MARINE_BODY = {
  hourly: {
    time: ["2026-07-26T11:00", "2026-07-26T12:00", "2026-07-26T13:00"],
    wave_height: [1.1, 1.4, 1.6],
    wave_direction: [200, 210, 215],
    sea_surface_temperature: [27.1, 27.3, 27.4],
  },
};

const ATMOSPHERIC_BODY = {
  hourly: {
    time: ["2026-07-26T11:00", "2026-07-26T12:00", "2026-07-26T13:00"],
    wind_speed_10m: [16.2, 18.52, 20.0], // km/h
    wind_direction_10m: [180, 190, 195],
    visibility: [24000, 21000, 19000],
  },
};

/** Routes marine vs forecast endpoints to the right fixture. */
function openMeteoFetch(
  marine: unknown = MARINE_BODY,
  atmospheric: unknown = ATMOSPHERIC_BODY,
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return url.includes("marine-api")
      ? jsonResponse(marine)
      : jsonResponse(atmospheric);
  }) as unknown as typeof fetch;
}

function makeProvider(
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof EnvironmentalIntelligenceProvider>[0]> = {},
  clockRef?: { ms: number },
) {
  const clock = clockRef ? () => clockRef.ms : () => NOW;
  return new EnvironmentalIntelligenceProvider({ fetchImpl, clock, ...extra });
}

// ── metadata & capability ───────────────────────────────────────────

describe("EnvironmentalIntelligenceProvider — metadata", () => {
  it("registers exactly one capability: ENVIRONMENTAL_INTELLIGENCE", () => {
    const p = makeProvider(openMeteoFetch());
    expect(p.capabilities).toEqual(["ENVIRONMENTAL_INTELLIGENCE"]);
    expect(p.id).toBe("environmental-intelligence");
    expect(ENVIRONMENTAL_INTELLIGENCE_METADATA.requiresAuth).toBe(false);
  });

  it("caches for one hour", () => {
    expect(ENVIRONMENTAL_CACHE_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("defaults to Open-Meteo Marine as Source 1", () => {
    const p = makeProvider(openMeteoFetch());
    expect(p.sources).toHaveLength(1);
    expect(p.sources[0]).toBeInstanceOf(OpenMeteoMarineAdapter);
    expect(p.sources[0].sourceName).toBe("Open-Meteo Marine");
  });
});

// ── valid coordinates ───────────────────────────────────────────────

describe("EnvironmentalIntelligenceProvider — valid coordinates", () => {
  it("returns one normalized Environmental Evidence entity", async () => {
    const p = makeProvider(openMeteoFetch());
    const result = await p.acquire(LAGOS);

    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(1);

    const record = result.records[0];
    expect(record.kind).toBe("weather");
    expect(record.grade).toBe("OBSERVED");
    expect(record.source).toBe("environmental-intelligence");
    expect(record.observedAt).toBe(AT);

    const f = record.fields;
    expect(f.latitude).toBe(6.45);
    expect(f.longitude).toBe(3.38);
    expect(f.portCode).toBe("NGLOS");
    expect(f.waveHeight).toBe(1.4);
    expect(f.waveDirection).toBe(210);
    expect(f.windSpeed).toBe(10); // 18.52 km/h → 10 kn
    expect(f.windDirection).toBe(190);
    expect(f.visibility).toBe(21000);
    expect(f.seaSurfaceTemperature).toBe(27.3);
    expect(f.source).toBe("Open-Meteo Marine");
    expect(f.confidence).toBe(1);
    expect(String(f.rawHash)).not.toHaveLength(0);
    expect(record.units?.windSpeed).toBe("kn");
    expect((record as { rawPayload?: unknown }).rawPayload).toBeDefined();
  });

  it("selects the observation nearest the investigation time", async () => {
    const p = makeProvider(openMeteoFetch());
    const result = await p.acquire({ ...LAGOS, investigationTime: "2026-07-26T13:10:00Z" });
    expect(result.records[0].fields.waveHeight).toBe(1.6);
  });

  it("emits NO interpretation — no CALM/ROUGH/SAFE/UNSAFE/risk verdicts", async () => {
    const p = makeProvider(openMeteoFetch());
    const record = (await p.acquire(LAGOS)).records[0];
    const serialized = JSON.stringify(record).toUpperCase();
    for (const verdict of ["CALM", "ROUGH", "SAFE", "UNSAFE", "LOW RISK", "HIGH RISK", "SEVERITY"]) {
      expect(serialized).not.toContain(verdict);
    }
    // The condition marker is deliberately non-judgemental.
    expect(record.fields.condition).toBe("OBSERVED");
  });
});

// ── invalid coordinates ─────────────────────────────────────────────

describe("EnvironmentalIntelligenceProvider — invalid coordinates", () => {
  const cases: Array<[string, EnvironmentalRequest]> = [
    ["latitude above range", { latitude: 91, longitude: 0 }],
    ["latitude below range", { latitude: -91, longitude: 0 }],
    ["longitude above range", { latitude: 0, longitude: 181 }],
    ["longitude below range", { latitude: 0, longitude: -181 }],
    ["NaN latitude", { latitude: Number.NaN, longitude: 0 }],
    ["non-numeric longitude", { latitude: 0, longitude: "3.4" as unknown as number }],
  ];

  for (const [label, request] of cases) {
    it(`rejects ${label} without calling the network`, async () => {
      const fetchImpl = openMeteoFetch();
      const p = makeProvider(fetchImpl);
      const result = await p.acquire(request);
      expect(result.ok).toBe(false);
      expect(result.records).toEqual([]);
      expect(result.error).toMatch(/invalid (latitude|longitude)/);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  }

  it("rejects an inverted time range", () => {
    expect(
      validateRequest({
        latitude: 0,
        longitude: 0,
        timeRange: { from: "2026-07-26T12:00:00Z", to: "2026-07-25T12:00:00Z" },
      }),
    ).toMatch(/precedes/);
  });

  it("accepts a valid request", () => {
    expect(validateRequest(LAGOS)).toBeNull();
  });
});

// ── cache ───────────────────────────────────────────────────────────

describe("EnvironmentalIntelligenceProvider — cache", () => {
  it("serves a cache hit without a second network call", async () => {
    const fetchImpl = openMeteoFetch();
    const p = makeProvider(fetchImpl);

    const first = await p.acquire(LAGOS);
    const callsAfterFirst = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const second = await p.acquire(LAGOS);

    expect(second.records[0].hash).toBe(first.records[0].hash);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsAfterFirst,
    );
  });

  it("re-acquires after the 1h TTL expires", async () => {
    const clockRef = { ms: NOW };
    const fetchImpl = openMeteoFetch();
    const cache = new EvidenceCache({
      defaultTtlMs: ENVIRONMENTAL_CACHE_TTL_MS,
      clock: () => clockRef.ms,
    });
    const p = makeProvider(fetchImpl, { cache }, clockRef);

    await p.acquire(LAGOS);
    const before = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    clockRef.ms = NOW + ENVIRONMENTAL_CACHE_TTL_MS + 1;
    await p.acquire(LAGOS);

    expect(
      (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(before);
  });

  it("bypasses the cache on forceRefresh", async () => {
    const fetchImpl = openMeteoFetch();
    const p = makeProvider(fetchImpl);
    await p.acquire(LAGOS);
    const before = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await p.acquire({ ...LAGOS, forceRefresh: true });
    expect(
      (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(before);
  });
});

// ── validation of produced evidence ─────────────────────────────────

describe("EnvironmentalIntelligenceProvider — evidence validation", () => {
  it("produces records the framework validator accepts without errors", async () => {
    const p = makeProvider(openMeteoFetch());
    const { records } = await p.acquire(LAGOS);
    const { issues } = validateRecords(records);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues.filter((i) => i.code === "missing-required")).toEqual([]);
  });

  it("keeps absent measures null instead of inventing them", async () => {
    const partialMarine = {
      hourly: { time: ["2026-07-26T12:00"], wave_height: [1.4] },
    };
    const p = makeProvider(openMeteoFetch(partialMarine, { hourly: { time: [] } }));
    const record = (await p.acquire(LAGOS)).records[0];
    expect(record.fields.waveHeight).toBe(1.4);
    expect(record.fields.waveDirection).toBeNull();
    expect(record.fields.windSpeed).toBeNull();
    expect(record.fields.visibility).toBeNull();
    // Incomplete acquisition lowers acquisition confidence, honestly.
    expect(Number(record.fields.confidence)).toBeLessThan(1);
  });

  it("scores acquisition confidence on completeness and temporal fit", () => {
    expect(acquisitionConfidence([1, 2, 3, 4, 5, 6], NOW, NOW)).toBe(1);
    expect(acquisitionConfidence([1, null, null, null, null, null], NOW, NOW)).toBe(0.17);
    expect(
      acquisitionConfidence([1, 2, 3, 4, 5, 6], NOW + 6 * 3600_000, NOW),
    ).toBe(0.75);
  });
});

// ── empty response & failures ───────────────────────────────────────

describe("EnvironmentalIntelligenceProvider — empty response", () => {
  it("returns an empty, successful package when the source has no data", async () => {
    const p = makeProvider(openMeteoFetch({ hourly: { time: [] } }, { hourly: { time: [] } }));
    const result = await p.acquire(LAGOS);
    expect(result.ok).toBe(true);
    expect(result.records).toEqual([]);
  });

  it("reports a non-200 upstream as a failed result, never a throw", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: true }, 503)) as unknown as typeof fetch;
    const p = makeProvider(fetchImpl);
    const result = await p.acquire(LAGOS);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("503");
  });
});

describe("EnvironmentalIntelligenceProvider — timeout", () => {
  it("aborts and reports a timeout without throwing", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    ) as unknown as typeof fetch;

    const p = makeProvider(fetchImpl, { timeoutMs: 5 });
    const result = await p.acquire(LAGOS);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timeout");

    const health = await p.healthCheck();
    expect(health.failureRate).toBeGreaterThan(0);
    expect(health.lastError).toContain("timeout");
  });
});

// ── multi-source readiness ──────────────────────────────────────────

describe("EnvironmentalIntelligenceProvider — multi-source architecture", () => {
  it("accepts a future adapter and returns the same normalized shape", async () => {
    const futureNoaa: EnvironmentalSourceAdapter = {
      id: "noaa-future",
      sourceName: "NOAA",
      supports: () => true,
      observe: async (request) => ({
        location: { latitude: request.latitude, longitude: request.longitude },
        observationTime: AT,
        waveHeight: 2.2,
        waveDirection: 95,
        windSpeed: 14,
        windDirection: 100,
        visibility: 9000,
        seaSurfaceTemperature: 25.5,
        source: "NOAA",
        confidence: 0.9,
        rawPayload: { adapter: "noaa-future" },
        rawHash: "noaa-hash",
      }),
    };

    const p = makeProvider(openMeteoFetch(), { sources: [futureNoaa] });
    const record = (await p.acquire(LAGOS)).records[0];

    // Identical evidence contract — the platform never learns the source changed.
    expect(record.kind).toBe("weather");
    expect(record.source).toBe("environmental-intelligence");
    expect(record.fields.source).toBe("NOAA");
    expect(record.fields.waveHeight).toBe(2.2);
  });

  it("falls through to the next source when the first declines or fails", async () => {
    const declines: EnvironmentalSourceAdapter = {
      id: "coverage-limited",
      sourceName: "Regional",
      supports: () => false,
      observe: async () => {
        throw new Error("must not be called");
      },
    };
    const failing: EnvironmentalSourceAdapter = {
      id: "flaky",
      sourceName: "Flaky",
      supports: () => true,
      observe: async () => {
        throw new Error("upstream down");
      },
    };
    const working: EnvironmentalSourceAdapter = {
      id: "backup",
      sourceName: "Backup",
      supports: () => true,
      observe: async (request) => ({
        location: { latitude: request.latitude, longitude: request.longitude },
        observationTime: AT,
        waveHeight: 0.8,
        waveDirection: null,
        windSpeed: null,
        windDirection: null,
        visibility: null,
        seaSurfaceTemperature: null,
        source: "Backup",
        confidence: 0.4,
        rawPayload: {},
        rawHash: "backup-hash",
      }),
    };

    const p = makeProvider(openMeteoFetch(), { sources: [declines, failing, working] });
    const result = await p.acquire(LAGOS);
    expect(result.ok).toBe(true);
    expect(result.records[0].fields.source).toBe("Backup");
  });
});

// ── Connector Framework & Provider Resolver integration ─────────────

describe("EnvironmentalIntelligenceProvider — framework integration", () => {
  it("is discoverable by capability through the existing registry", () => {
    const registry = new ConnectorRegistry();
    registry.register(makeProvider(openMeteoFetch()));
    const found = registry.getByCapability("ENVIRONMENTAL_INTELLIGENCE");
    expect(found.map((c) => c.id)).toEqual(["environmental-intelligence"]);
    // It must not leak into unrelated capabilities.
    expect(registry.getByCapability("SANCTIONS")).toEqual([]);
  });

  it("is selected by the existing Provider Resolver as the single provider", () => {
    const provider = makeProvider(openMeteoFetch());
    const resolution = resolveProvider("ENVIRONMENTAL_INTELLIGENCE", [provider], {
      environment: "production",
    });
    expect(resolution.provider?.id).toBe("environmental-intelligence");
    expect(resolution.chain).toHaveLength(1);
  });

  it("fails over cleanly when the provider is unhealthy", () => {
    const provider = makeProvider(openMeteoFetch());
    const resolution = resolveProvider("ENVIRONMENTAL_INTELLIGENCE", [provider], {
      environment: "production",
      isHealthy: () => false,
    });
    expect(resolution.provider).toBeNull();
  });

  it("is registered on the shared ConnectorManager alongside existing providers", () => {
    const manager = new ConnectorManager();
    registerEvidenceProviders(manager);
    const ids = manager.getByCapability("ENVIRONMENTAL_INTELLIGENCE").map((c) => c.id);
    expect(ids).toContain("environmental-intelligence");
    expect(manager.getByCapability("SANCTIONS").map((c) => c.id)).toContain("open-sanctions");
  });

  it("serves the Connector search() contract from free-text coordinates", async () => {
    const p = makeProvider(openMeteoFetch());
    const result = await p.search({ text: "6.45, 3.38" });
    expect(result.ok).toBe(true);
    expect(result.records[0].fields.latitude).toBe(6.45);
  });

  it("declines a query with no coordinates instead of guessing a location", async () => {
    const p = makeProvider(openMeteoFetch());
    const result = await p.search({ text: "MV OCEAN PEARL" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no coordinates");
  });
});

// ── architecture freeze ─────────────────────────────────────────────

describe("EnvironmentalIntelligenceProvider — architecture freeze", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "src/connectors/implementations/EnvironmentalIntelligenceProvider.ts",
    ),
    "utf8",
  );

  it("contains no persistence or Supabase access", () => {
    expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(source).not.toMatch(/\bsupabase\b/i);
    expect(source).not.toMatch(/\.insert\(|\.upsert\(|\.from\(["']/);
  });

  it("does not create a Canonical UIP, resolve identities, or dedupe", () => {
    expect(source).not.toMatch(/registerUip|getUip|source_uip_id/);
    expect(source).not.toMatch(/identity-resolver|resolveIdentity|dedupe|deduplicate/i);
  });

  it("does not reach into OIE, OKL, MIBC, IFE, workspace, or reports", () => {
    for (const forbidden of [
      "@/services/oie",
      "@/services/okl",
      "@/services/mibc",
      "@/services/ife",
      "@/stores/",
      "@/services/orchestration",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("introduces no new registry and no new cache implementation", () => {
    expect(source).toContain('from "@/services/ial/cache"');
    expect(source).not.toMatch(/class\s+\w*Cache\b/);
    expect(source).not.toMatch(/class\s+\w*Registry\b/);
  });
});
