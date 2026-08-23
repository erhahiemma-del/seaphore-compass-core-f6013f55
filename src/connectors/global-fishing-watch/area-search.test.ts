/**
 * Global Fishing Watch — area/positions query.
 *
 * The upstream API cannot be reached in CI (no credential, and no live
 * network), so these tests exercise the two things that are genuinely
 * ours: the failure taxonomy and the normalisation/de-duplication rules.
 * `fetch` is stubbed; nothing here asserts GFW's own behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearGfwAreaCache, runGfwAreaSearch } from "@/lib/server/gfw.server";

const BBOX = [2.5, 3.0, 9.5, 8.5] as const;

/** Install a fetch stub returning the given upstream payload. */
function stubFetch(payload: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    type: "fishing",
    start: "2026-08-04T10:00:00.000Z",
    position: { lat: 5.2, lon: 4.1 },
    speed: 8.4,
    course: 145,
    vessel: { id: "gfw-1", imo: "9411765", ssvid: "657123456", name: "MV Test", flag: "NGA" },
    ...overrides,
  };
}

beforeEach(() => {
  clearGfwAreaCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearGfwAreaCache();
});

describe("runGfwAreaSearch — credential handling", () => {
  it("reports credentials-missing without calling the network", async () => {
    vi.stubEnv("GFW_API_TOKEN", "");
    vi.stubEnv("GLOBAL_FISHING_WATCH_API_KEY", "");
    const spy = stubFetch({ entries: [] });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.status).toBe("credentials-missing");
    expect(result.vessels).toEqual([]);
    expect(result.message).toMatch(/GFW_API_TOKEN/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports auth-failed on a 401 without throwing", async () => {
    vi.stubEnv("GFW_API_TOKEN", "test-token");
    stubFetch({}, { status: 401, ok: false });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.status).toBe("auth-failed");
    expect(result.vessels).toEqual([]);
    expect(result.message).toMatch(/Invalid/i);
  });

  it("reports upstream-error on a 500 without throwing", async () => {
    vi.stubEnv("GFW_API_TOKEN", "test-token");
    stubFetch({}, { status: 500, ok: false });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.status).toBe("upstream-error");
    expect(result.vessels).toEqual([]);
  });

  it("reports upstream-error when the network throws", async () => {
    vi.stubEnv("GFW_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.status).toBe("upstream-error");
    expect(result.message).toMatch(/ECONNREFUSED/);
  });
});

describe("runGfwAreaSearch — input validation", () => {
  it("rejects a malformed bounding box before any network call", async () => {
    vi.stubEnv("GFW_API_TOKEN", "test-token");
    const spy = stubFetch({ entries: [] });

    const result = await runGfwAreaSearch({
      bbox: [1, 2, Number.NaN, 4] as unknown as typeof BBOX,
    });

    expect(result.status).toBe("upstream-error");
    expect(result.message).toMatch(/bounding box/i);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("runGfwAreaSearch — normalisation", () => {
  beforeEach(() => {
    vi.stubEnv("GFW_API_TOKEN", "test-token");
  });

  it("normalises an event into a flat vessel with provenance", async () => {
    stubFetch({ entries: [event()] });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.status).toBe("ok");
    expect(result.vessels).toHaveLength(1);
    const vessel = result.vessels[0];
    expect(vessel).toMatchObject({
      vesselId: "gfw-1",
      imo: "9411765",
      mmsi: "657123456",
      name: "MV Test",
      flag: "NGA",
      latitude: 5.2,
      longitude: 4.1,
      speedKnots: 8.4,
      courseDeg: 145,
      eventType: "fishing",
      source: "global-fishing-watch",
    });
    expect(vessel.retrievedAt).toBeTruthy();
  });

  it("never leaks a raw upstream object", async () => {
    stubFetch({ entries: [event({ rawProviderBlob: { secret: "should not appear" } })] });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(JSON.stringify(result)).not.toContain("should not appear");
    expect(JSON.stringify(result)).not.toContain("rawProviderBlob");
  });

  it("tolerates alternative field spellings", async () => {
    stubFetch({
      entries: [
        event({
          position: { latitude: 6.1, longitude: 3.9 },
          start: undefined,
          timestamp: "2026-08-04T11:00:00.000Z",
          speed: undefined,
          sog: 11.2,
          vessel: { vesselId: "gfw-alt", mmsi: "123", shipname: "Alt Name" },
        }),
      ],
    });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.vessels[0]).toMatchObject({
      vesselId: "gfw-alt",
      latitude: 6.1,
      longitude: 3.9,
      speedKnots: 11.2,
      name: "Alt Name",
    });
  });

  it("discards entries with no position and counts them", async () => {
    stubFetch({ entries: [event(), { type: "fishing", start: "2026-08-04T10:00:00.000Z" }] });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.vessels).toHaveLength(1);
    expect(result.diagnostics.entriesReceived).toBe(2);
    expect(result.diagnostics.entriesDiscarded).toBe(1);
  });

  it("discards out-of-range coordinates rather than plotting them", async () => {
    stubFetch({ entries: [event({ position: { lat: 999, lon: 4.1 } })] });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.vessels).toHaveLength(0);
    expect(result.diagnostics.entriesDiscarded).toBe(1);
  });

  it("discards an entry with an unparseable timestamp", async () => {
    stubFetch({ entries: [event({ start: "not-a-date" })] });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.vessels).toHaveLength(0);
  });

  it("keeps only the latest observation per vessel", async () => {
    stubFetch({
      entries: [
        event({ start: "2026-08-04T09:00:00.000Z", position: { lat: 1.1, lon: 1.1 } }),
        event({ start: "2026-08-04T12:00:00.000Z", position: { lat: 2.2, lon: 2.2 } }),
        event({ start: "2026-08-04T10:00:00.000Z", position: { lat: 3.3, lon: 3.3 } }),
      ],
    });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.vessels).toHaveLength(1);
    expect(result.vessels[0].latitude).toBe(2.2);
    expect(result.diagnostics.entriesReceived).toBe(3);
    expect(result.diagnostics.vesselsReturned).toBe(1);
  });

  it("reports empty rather than ok when nothing is in the box", async () => {
    stubFetch({ entries: [] });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.status).toBe("empty");
    expect(result.vessels).toEqual([]);
    expect(result.message).toMatch(/No Global Fishing Watch activity/);
  });

  it("tolerates a response with no entries array", async () => {
    stubFetch({ unexpected: true });

    const result = await runGfwAreaSearch({ bbox: BBOX });

    expect(result.status).toBe("empty");
    expect(result.vessels).toEqual([]);
  });
});

describe("runGfwAreaSearch — caching", () => {
  beforeEach(() => {
    vi.stubEnv("GFW_API_TOKEN", "test-token");
  });

  it("serves an identical request from cache without a second call", async () => {
    const spy = stubFetch({ entries: [event()] });
    const window = { since: "2026-08-03T00:00:00.000Z", until: "2026-08-04T00:00:00.000Z" };

    const first = await runGfwAreaSearch({ bbox: BBOX, ...window });
    const second = await runGfwAreaSearch({ bbox: BBOX, ...window });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first.diagnostics.fromCache).toBe(false);
    expect(second.diagnostics.fromCache).toBe(true);
    expect(second.vessels).toEqual(first.vessels);
  });

  it("treats a different bounding box as a different request", async () => {
    const spy = stubFetch({ entries: [event()] });
    const window = { since: "2026-08-03T00:00:00.000Z", until: "2026-08-04T00:00:00.000Z" };

    await runGfwAreaSearch({ bbox: BBOX, ...window });
    await runGfwAreaSearch({ bbox: [0, 0, 1, 1], ...window });

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
