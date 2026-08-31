/**
 * Declared capability must equal renderable capability.
 *
 * The Layer Panel reads `status` to decide whether a layer is offered as
 * operational. `resolveVisibility` does *not* consult `status`, so a
 * layer marked `ready` whose render layers nobody installs presents as a
 * working toggle and does nothing — and an officer reads an empty layer
 * as "no activity" rather than "not built". That is the same class of
 * error as drawing an unreported heading.
 *
 * The renderer's `installSourcesAndLayers` is WebGL-bound and cannot run
 * here, so the installed set is transcribed below and checked against
 * the source file. If the two disagree the test fails, which is the
 * point: the transcription cannot rot silently.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { INSTALLED_RENDER_LAYERS, LAYER_IDS, layerRegistry } from "@/services/geospatial";

/**
 * The renderer's own declaration of what it installs.
 *
 * Taken from the renderer rather than transcribed here, so this file
 * cannot drift from it. The renderer checks itself against the same
 * list at runtime — `verifyInstalledLayers` — which is what catches the
 * case this list cannot: an expression MapLibre rejects, leaving a
 * layer that the source adds and the engine never accepts.
 */
const INSTALLED = INSTALLED_RENDER_LAYERS;

const RENDERER_SOURCE = readFileSync(
  resolve(process.cwd(), "src/services/geospatial/renderers/maplibre-renderer.ts"),
  "utf8",
);

describe("the renderer's declared install list matches its code", () => {
  it("adds every layer the list names", () => {
    for (const id of INSTALLED) {
      const key = Object.entries(LAYER_IDS).find(([, value]) => value === id)?.[0];
      expect(RENDERER_SOURCE, `renderer never adds ${id}`).toContain(`id: LAYER_IDS.${key},`);
    }
  });

  it("adds no layer the list omits", () => {
    const added = [...RENDERER_SOURCE.matchAll(/id: LAYER_IDS\.(\w+),/g)].map(
      ([, key]) => LAYER_IDS[key as keyof typeof LAYER_IDS],
    );
    expect([...new Set(added)].sort()).toEqual([...INSTALLED].sort());
  });
});

describe("declared ready equals actually renderable", () => {
  it("every ready layer has all of its render layers installed", () => {
    const installed = new Set(INSTALLED);
    for (const layer of layerRegistry.list()) {
      if (layer.status !== "ready") continue;
      for (const renderId of layer.renderLayerIds) {
        expect(
          installed,
          `layer "${layer.id}" is declared ready but nothing installs "${renderId}"`,
        ).toContain(renderId);
      }
    }
  });

  it("every pending layer explains itself", () => {
    for (const layer of layerRegistry.list()) {
      if (layer.status !== "pending-source") continue;
      expect(layer.pendingReason, `layer "${layer.id}" is pending with no reason`).toBeTruthy();
    }
  });

  it("keeps observed tracks separate from voyage relationships", () => {
    // The M2 distinction, enforced. A voyage layer is renderable
    // because the voyages table is real; an observed track is not,
    // because no AIS history provider is connected. Marking the track
    // layer ready would make "no track drawn" read as "the vessel did
    // not move".
    const voyages = layerRegistry.require("voyages");
    expect(voyages.status).toBe("ready");
    expect(voyages.description).toMatch(/not an observed vessel track/i);
    // Points only. No line layer may connect two voyage endpoints —
    // a line between two ports reads as a route whatever it is called.
    expect(voyages.renderLayerIds).not.toContain("voyage-arcs-layer");

    const tracks = layerRegistry.require("aisTrack");
    expect(tracks.status).toBe("pending-source");
    expect(tracks.pendingReason).toBeTruthy();
  });

  it("keeps vessel clustering honest", () => {
    /*
     * This guard used to assert clustering stayed `pending-source`,
     * because it was declared ready while no renderer drew it — a toggle
     * that did nothing. Clustering now exists, so the guard asserts the
     * constraint that made it hard instead of the fact that it was
     * missing: MapLibre clusters at the source, and the primary vessel
     * source is `promoteId`-addressed so `updateData` can reach one hull.
     * Clustering therefore has to live on a *different* source.
     */
    const clusters = layerRegistry.require("vesselClusters");
    expect(clusters.status).toBe("ready");
    expect(clusters.renderLayerIds).toContain(LAYER_IDS.vesselClusters);
    expect(clusters.renderLayerIds).toContain(LAYER_IDS.clusterCount);

    /*
     * Clustering must be enabled on its own source. Scoped to that
     * `addSource` call for the same reason as the promoteId check below.
     */
    const clusterSourceCall = RENDERER_SOURCE.slice(
      RENDERER_SOURCE.indexOf("map.addSource(SOURCE_IDS.vesselClusters,"),
    ).slice(0, 400);
    expect(clusterSourceCall).toMatch(/cluster:\s*true/);
    for (const id of [LAYER_IDS.vesselClusters, LAYER_IDS.clusterCount]) {
      const declaration = RENDERER_SOURCE.slice(
        RENDERER_SOURCE.indexOf(
          `id: LAYER_IDS.${id === LAYER_IDS.vesselClusters ? "vesselClusters" : "clusterCount"},`,
        ),
      );
      expect(declaration.slice(0, 240)).toContain("SOURCE_IDS.vesselClusters");
    }

    /*
     * And the primary source keeps its promoteId. Losing it would break
     * single-vessel updates silently — the map would still draw, just
     * with a full re-write per position report.
     *
     * Scoped to the `addSource` call, not the whole file. The first
     * version searched everywhere and passed even with the real
     * declaration renamed, because the prose above and the comments in
     * the renderer both contain the literal `promoteId: "imo"`. A guard
     * that its own explanation satisfies is checking nothing.
     */
    const vesselSourceCall = RENDERER_SOURCE.slice(
      RENDERER_SOURCE.indexOf("map.addSource(SOURCE_IDS.vessels,"),
    ).slice(0, 300);
    expect(vesselSourceCall).toMatch(/promoteId:\s*"imo"/);
    // And clustering is emphatically not on it.
    expect(vesselSourceCall).not.toMatch(/cluster:\s*true/);
  });

  it("keeps traffic density independent of risk", () => {
    /*
     * Density is presence; risk is assessment. They share no input, and
     * a density layer that weighted on `attentionScore` would make a busy
     * anchorage look dangerous and a lone dark hull look quiet.
     */
    const density = layerRegistry.require("traffic-density");
    expect(density.status).toBe("ready");
    expect(density.renderLayerIds).toEqual([LAYER_IDS.trafficDensity]);
    expect(density.renderLayerIds).not.toContain(LAYER_IDS.riskHeatmap);

    // The density layer carries a constant weight — no feature drives it.
    const block = RENDERER_SOURCE.slice(
      RENDERER_SOURCE.indexOf("id: LAYER_IDS.trafficDensity,"),
    ).slice(0, 900);
    expect(block).toContain('"heatmap-weight": 1');
    expect(block).not.toContain("attentionScore");
  });

  it("names no render layer that does not exist", () => {
    const known = new Set(Object.values(LAYER_IDS));
    for (const layer of layerRegistry.list()) {
      for (const renderId of layer.renderLayerIds) {
        expect(known, `layer "${layer.id}" names unknown render layer "${renderId}"`).toContain(
          renderId,
        );
      }
    }
  });
});

describe("domain presets name only ready, installed layers", () => {
  it("holds for every domain", async () => {
    const { DOMAIN_PRESETS } = await import("@/services/geospatial");
    const installed = new Set(INSTALLED);
    for (const [domain, layers] of Object.entries(DOMAIN_PRESETS)) {
      for (const id of layers) {
        const definition = layerRegistry.get(id);
        expect(definition, `domain "${domain}" names unknown layer "${id}"`).toBeDefined();
        expect(definition?.status, `domain "${domain}" names pending layer "${id}"`).toBe("ready");
        for (const renderId of definition?.renderLayerIds ?? []) {
          expect(installed).toContain(renderId);
        }
      }
    }
  });
});

describe("the renderer draws in the palette it was mounted with", () => {
  /*
   * Ten paint properties — buildings, the graticule, both voyage endpoint
   * colours, the voyage relationship stroke and its label, and four label
   * halos — used to read the dark `MARITIME_PALETTE` constant directly,
   * while `mount` resolved the real palette a few lines above and passed
   * it only to the basemap styling.
   *
   * Nothing caught it because nothing selected the light palette, so the
   * bypass was invisible until Mission Control opted in: a near-white map
   * would have drawn navy buildings, a dark graticule and dark label
   * halos, and the first symptom would have been "the light theme looks
   * broken" rather than "ten properties ignore their palette".
   */
  it("reads no palette member from the module constant", () => {
    const direct = [...RENDERER_SOURCE.matchAll(/(?<!LIGHT_)\bMARITIME_PALETTE\.(\w+)/g)].map(
      (m) => m[1],
    );
    expect(direct, `hardcoded palette reads: ${direct.join(", ")}`).toEqual([]);
  });

  it("takes the palette as a parameter rather than a field", () => {
    // A parameter makes installing layers without a palette impossible to
    // express; a field could be read before mount had set it.
    // The map joined the signature when the stale-instance race was
    // fixed; the palette is still a parameter, which is what this pins.
    expect(RENDERER_SOURCE).toMatch(
      /installSourcesAndLayers\(map: MapLibreMap, palette: MaritimePalette\)/,
    );
    expect(RENDERER_SOURCE).toMatch(/this\.installLayersWithRetry\(map, palette\)/);
  });

  it("resolves the palette through the shared mapping", () => {
    // One mapping, beside the palettes, so no caller can pair the
    // institutional theme with the maritime palette.
    expect(RENDERER_SOURCE).toContain("paletteFor(options.palette)");
  });
});

describe("each surface gets the palette its context calls for", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("gives Mission Control the institutional palette", () => {
    // An institutional page, not an operations room: a dark map inside a
    // white page reads as a hole in it.
    expect(read("src/features/mission-control/MissionControl.tsx")).toMatch(
      /<MapCanvas[^>]*palette="institutional"/s,
    );
  });

  it("leaves the operational surfaces on the maritime default", () => {
    // Full-bleed surfaces read for long periods keep the dark palette.
    for (const surface of [
      "src/features/maritime/MaritimeCommand.tsx",
      "src/features/ports/Ports.tsx",
      "src/features/vessel/Vessel.tsx",
    ]) {
      expect(read(surface), `${surface} should not opt into a palette`).not.toContain(
        'palette="institutional"',
      );
    }
  });

  it("keeps one palette interface as the source of truth", () => {
    // Both themes satisfy MaritimePalette, so adding a token obliges
    // every theme to answer for it rather than one silently falling back.
    const constants = read("src/services/geospatial/constants.ts");
    expect(constants).toContain("export const MARITIME_PALETTE: MaritimePalette");
    expect(constants).toContain("export const LIGHT_MARITIME_PALETTE: MaritimePalette");
  });
});

describe("the mount installs onto the map it was given", () => {
  /*
   * The intermittent zero-layer mount.
   *
   * About half of cold loads came up with the basemap styled correctly —
   * light palette, right sea colour — and not one operational layer on
   * it: no ports, no vessels, no EEZ, no graticule. Nothing logged,
   * because from each call's own point of view it had succeeded.
   *
   * The cause was an instance field read across an async gap. `mount`
   * takes a token, awaits `import("maplibre-gl")`, builds a map and
   * assigns `this.map`. Two mounts can be waiting on that import at once
   * — React remounts the canvas — and whichever resumed last won
   * `this.map`, including a superseded one. The live mount then styled
   * its own local map while `installSourcesAndLayers`, which read
   * `this.map`, installed every source and layer onto the other
   * instance. Both halves "worked"; they simply worked on different maps.
   *
   * These assertions are structural because the behaviour needs a real
   * MapLibre instance and a real race to reproduce. What they pin is the
   * property that makes the race unrepresentable: one map value, passed
   * explicitly, for the whole sequence.
   */
  it("passes the map into installation rather than reading the field", () => {
    expect(RENDERER_SOURCE).toMatch(
      /private installSourcesAndLayers\(map: MapLibreMap, palette: MaritimePalette\)/,
    );
    // The old `const map = this.map;` at the top of the installer is the
    // exact line that allowed the divergence.
    const installer =
      /private installSourcesAndLayers\([\s\S]*?\n {2}\}/.exec(RENDERER_SOURCE)?.[0] ?? "";
    expect(installer).not.toMatch(/const map = this\.map/);
  });

  it("styles, installs, verifies and reports against one map value", () => {
    // A single local `map` through the whole tail of mount(). If any of
    // these reverts to `this.map`, the divergence is representable again.
    expect(RENDERER_SOURCE).toContain("applyMaritimeStyle(map as unknown as StyleTarget, palette)");
    expect(RENDERER_SOURCE).toContain("this.installLayersWithRetry(map, palette)");
    expect(RENDERER_SOURCE).toContain("this.verifyInstalledLayers(map)");
    expect(RENDERER_SOURCE).toContain("publishStyleDiagnostics(map, styleResult)");
  });

  it("refuses to claim the instance for a superseded mount", () => {
    // Guarded after the dynamic import and again before `this.map = map`,
    // so a stale call can neither build a doomed map nor overwrite the
    // live one.
    const beforeAssign = RENDERER_SOURCE.slice(0, RENDERER_SOURCE.indexOf("this.map = map;"));
    const guards = beforeAssign.match(/if \(token !== this\.mountToken\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it("makes a second installation a no-op rather than a duplicate", () => {
    // Retry must not add a source or layer twice.
    expect(RENDERER_SOURCE).toMatch(/if \(this\.hasInstalledLayers\(map\)\)/);
    expect(RENDERER_SOURCE).toMatch(/private hasInstalledLayers\(map: MapLibreMap\): boolean/);
  });

  it("retries only a readiness race, and only once", () => {
    // A genuine error retried just fails twice and buries the first
    // message, so only "style is not done loading" is retried.
    expect(RENDERER_SOURCE).toMatch(/is not done loading/i);
    expect(RENDERER_SOURCE).toMatch(/attempt === 1/);
  });

  it("never lets a total failure pass as a ready map", () => {
    // Emitting to the bus alone was invisible: nothing subscribes for
    // logging, so "we drew nothing" looked like "nothing is reporting".
    expect(RENDERER_SOURCE).toMatch(/console\.error\(`\[Seaphore map\]/);
    expect(RENDERER_SOURCE).toMatch(/No operational layer installed/);
  });
});

describe("a mount that never loads still reports", () => {
  /*
   * The other half of the zero-layer mount, and the one that produced no
   * console output at all.
   *
   * `mount` cannot install anything until the style fires `load`. When
   * the basemap host is unreachable that event never arrives: MapLibre
   * reports the style error once, the handler swaps to the fallback
   * basemap, the fallback fails too, and `styleFailed` suppresses the
   * second report. The mount then waits forever on a promise nothing
   * will resolve.
   *
   * Reproduced by loading Mission Control with the basemap blocked: the
   * canvas mounted at full size, the page looked settled, `installed`
   * was 0, and neither the console nor the bus said anything. That is
   * the "apparently valid ready state" the brief forbids — so the wait
   * is bounded by a report, not by a cancellation.
   */
  it("bounds the wait for the style", () => {
    expect(RENDERER_SOURCE).toMatch(/private awaitStyleLoad\(map: MapLibreMap\): Promise<void>/);
    expect(RENDERER_SOURCE).toContain("await this.awaitStyleLoad(map)");
    expect(RENDERER_SOURCE).toMatch(/const STYLE_LOAD_STALL_MS = [\d_]+;/);
  });

  it("says so on both channels when the style stalls", () => {
    const waiter = /private awaitStyleLoad\([\s\S]*?\n {2}\}/.exec(RENDERER_SOURCE)?.[0] ?? "";
    expect(waiter).toMatch(/console\.error\(`\[Seaphore map\] \$\{message\}`\)/);
    expect(waiter).toMatch(/this\.bus\?\.emit\("map:error"/);
    // The message has to name the consequence, not just the delay — "no
    // operational layer has been installed" is the part that stops an
    // empty map reading as an empty sea.
    expect(waiter).toMatch(/No operational layer has been installed/);
  });

  it("keeps waiting rather than abandoning a slow map", () => {
    const waiter = /private awaitStyleLoad\([\s\S]*?\n {2}\}/.exec(RENDERER_SOURCE)?.[0] ?? "";
    // The timeout reports; only `load` resolves. A timeout that resolved
    // would send mount on to install onto a style that does not exist.
    expect(waiter).toMatch(/map\.once\("load", \(\) => \{[\s\S]*?resolve\(\);/);
    const timeoutBody =
      /setTimeout\(\(\) => \{[\s\S]*?\}, STYLE_LOAD_STALL_MS\)/.exec(waiter)?.[0] ?? "";
    expect(timeoutBody).not.toMatch(/resolve\(\)/);
    // ...and a map that does load must not leave the stall timer armed.
    expect(waiter).toMatch(/clearTimeout\(stall\)/);
  });
});

describe("symbol layers only ask the engine for rules it supports", () => {
  /*
   * `addLayer` does not throw on an unsupported expression — it declines
   * the layer and moves on. `port-labels-layer` carried
   * `"text-allow-overlap": ["==", ["get", "tier"], "major"]`, and both
   * overlap properties are `data-constant` in the style spec: zoom may
   * vary them, a feature may not. So the layer was rejected on every
   * mount and no port has drawn its name, with the only evidence an
   * error event nothing was listening to. The layer-count verification
   * added with the mount fix is what finally made it visible.
   *
   * Precedence between major and secondary ports now travels through
   * `symbol-sort-key`, which is data-driven and is the property meant
   * for it.
   */
  it("keeps feature expressions out of the overlap properties", () => {
    const overlap = /"(text|icon)-(allow-overlap|ignore-placement)":\s*([^\n]+)/g;
    const offending: string[] = [];
    for (const [, , , value] of RENDERER_SOURCE.matchAll(overlap)) {
      if (value.includes('["get"')) offending.push(value.trim());
    }
    expect(offending).toEqual([]);
  });

  it("still ranks major ports above secondary ones", () => {
    // Dropping the overlap rule must not drop the precedence with it.
    expect(RENDERER_SOURCE).toMatch(
      /"symbol-sort-key": \["coalesce", \["get", "labelPriority"\], 9\]/,
    );
  });
});
