import { describe, expect, it } from "vitest";

import {
  LAYER_GROUP_LABELS,
  LAYER_GROUP_ORDER,
  LIVE_THRESHOLD_MS,
  isLive,
  layerRegistry,
  resolveLayerState,
  type LayerDefinition,
} from "@/services/geospatial";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");

function layer(over: Partial<LayerDefinition> = {}): LayerDefinition {
  return {
    id: "test-layer",
    label: "Test",
    description: "A layer.",
    group: "VESSELS",
    renderLayerIds: ["test-render"],
    defaultVisible: false,
    status: "ready",
    order: 10,
    ...over,
  };
}

/* ─────────────────────── layer groups ─────────────────────── */

describe("layer groups", () => {
  it("offers the nine Phase 8 groups", () => {
    for (const group of [
      "VESSELS",
      "PORTS_INFRASTRUCTURE",
      "MARITIME_ZONES",
      "ENVIRONMENT",
      "TRADE_LOGISTICS",
      "RISK_INTELLIGENCE",
      "SATELLITE_EO",
      "INVESTIGATIONS",
      "GOVERNMENT_DATA",
    ] as const) {
      expect(LAYER_GROUP_ORDER).toContain(group);
      expect(LAYER_GROUP_LABELS[group]).toBeTruthy();
    }
  });

  it("keeps the legacy groups so no layer can vanish from the panel", () => {
    // Widening, not replacing. A layer not yet re-grouped still renders.
    expect(LAYER_GROUP_ORDER).toContain("OPERATIONAL");
    expect(LAYER_GROUP_ORDER).toContain("INTELLIGENCE");
    expect(LAYER_GROUP_ORDER).toContain("ANALYSIS");
  });

  it("orders the new groups ahead of the legacy ones", () => {
    expect(LAYER_GROUP_ORDER.indexOf("VESSELS")).toBeLessThan(
      LAYER_GROUP_ORDER.indexOf("OPERATIONAL"),
    );
  });

  it("assigns every registered layer to a known group", () => {
    for (const definition of layerRegistry.list()) {
      expect(LAYER_GROUP_ORDER, `${definition.id}`).toContain(definition.group);
    }
  });

  it("re-groups vessels and ports into the new taxonomy", () => {
    expect(layerRegistry.get("vessels")?.group).toBe("VESSELS");
    expect(layerRegistry.get("ports")?.group).toBe("PORTS_INFRASTRUCTURE");
    expect(layerRegistry.get("nigeria-eez")?.group).toBe("MARITIME_ZONES");
    expect(layerRegistry.get("sarDetections")?.group).toBe("SATELLITE_EO");
  });
});

/* ────────────────── the LIVE guarantees ───────────────────── */

describe("layer freshness", () => {
  it("marks a connected, current layer LIVE", () => {
    const state = resolveLayerState(
      layer(),
      { sourceId: "gfw", observedAt: new Date(NOW - 60_000).toISOString() },
      NOW,
    );

    expect(state.freshness).toBe("LIVE");
    expect(isLive(state)).toBe(true);
  });

  it("DEMO can never render as LIVE", () => {
    // Fixture is checked first, so nothing downstream can promote it —
    // not a recent timestamp, not a connected source.
    const state = resolveLayerState(
      layer(),
      {
        isFixture: true,
        sourceId: "gfw",
        observedAt: new Date(NOW).toISOString(),
      },
      NOW,
    );

    expect(state.freshness).toBe("DEMO");
    expect(isLive(state)).toBe(false);
    expect(state.note).toMatch(/Not a live observation/);
  });

  it("stale can never render as LIVE", () => {
    const state = resolveLayerState(
      layer(),
      { sourceId: "gfw", observedAt: new Date(NOW - 6 * 3_600_000).toISOString() },
      NOW,
    );

    expect(state.freshness).toBe("RECENT");
    expect(isLive(state)).toBe(false);
    expect(state.ageMs).toBe(6 * 3_600_000);
  });

  it("derives age from the observation rather than trusting the caller", () => {
    const state = resolveLayerState(
      layer(),
      { sourceId: "gfw", observedAt: new Date(NOW - LIVE_THRESHOLD_MS - 1).toISOString() },
      NOW,
    );
    // One millisecond past the threshold is not live.
    expect(state.freshness).toBe("RECENT");
  });

  it("a pending-source layer is PENDING, never empty-but-live", () => {
    // The distinction that matters: no connector is a fact about
    // Seaphore, not about the sea.
    const state = resolveLayerState(
      layer({ status: "pending-source", pendingReason: "No detector configured." }),
      { featureCount: 0 },
      NOW,
    );

    expect(state.freshness).toBe("PENDING");
    expect(state.note).toBe("No detector configured.");
    expect(isLive(state)).toBe(false);
  });

  it("explains a pending layer even without an authored reason", () => {
    const state = resolveLayerState(layer({ status: "pending-source" }), {}, NOW);
    expect(state.note).toMatch(/reflects Seaphore's collection, not the absence of objects/);
  });

  it("reports a connected but failing source as UNAVAILABLE", () => {
    const state = resolveLayerState(
      layer(),
      { sourceId: "gfw", failed: true, failureReason: "HTTP 503" },
      NOW,
    );

    expect(state.freshness).toBe("UNAVAILABLE");
    expect(state.note).toBe("HTTP 503");
  });

  it("distinguishes loading from unavailable", () => {
    expect(resolveLayerState(layer(), { loading: true }, NOW).freshness).toBe("PENDING");
    expect(resolveLayerState(layer(), { loading: false }, NOW).freshness).toBe("UNAVAILABLE");
  });

  it("treats an unparseable observation time as no observation", () => {
    const state = resolveLayerState(layer(), { observedAt: "not a date" }, NOW);
    expect(state.freshness).toBe("UNAVAILABLE");
    expect(state.ageMs).toBeNull();
  });

  it("carries the source through to the panel", () => {
    const state = resolveLayerState(
      layer(),
      {
        sourceId: "global-fishing-watch",
        sourceLabel: "Global Fishing Watch",
        observedAt: new Date(NOW).toISOString(),
        featureCount: 42,
      },
      NOW,
    );

    expect(state.sourceId).toBe("global-fishing-watch");
    expect(state.sourceLabel).toBe("Global Fishing Watch");
    expect(state.featureCount).toBe(42);
  });

  it("never invents a feature count", () => {
    // Null means "we do not know", which is not zero.
    expect(resolveLayerState(layer(), {}, NOW).featureCount).toBeNull();
  });
});
