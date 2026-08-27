/**
 * Post-deploy health checks for the Live Command Map.
 *
 * Two failures survive every other gate in CI. Both are silent, and both
 * make the map quietly less truthful rather than visibly broken:
 *
 *  1. The camera stops shallower than the imagery serves. Unit tests
 *     assert the constants agree (`camera-zoom-depth.test.ts`), but a
 *     constant is not a deployed map — the renderer, the scope, and the
 *     URL clamp all have to honour it against a real basemap.
 *  2. Vessels arrive and are never drawn. The update engine is unit
 *     tested against a fake renderer; whether a *deployed* build wires a
 *     provider through to the canvas is only answerable at runtime.
 *
 * Run against any origin:
 *   SEAPHORE_HEALTH_URL=https://seaphore-compass-core.lovable.app \
 *     bun run health:deploy
 *
 * The simulated provider is used on purpose. It is registered but
 * switched off by default, so this asks for it explicitly by URL — the
 * check must never depend on a live third-party feed having vessels in
 * Nigerian waters at the moment a deploy happens, or a quiet Sunday
 * becomes a failed deployment.
 */
import { expect, test } from "@playwright/test";

interface MapHealthSnapshot {
  rendererDraws: boolean;
  zoom: number;
  maxZoom: number;
  vesselCount: number;
  sources: string[];
  uptimeMs: number;
}

const BASE = (process.env.SEAPHORE_HEALTH_URL ?? "http://localhost:8080").replace(/\/$/, "");

/** Deep-zoom target. The point of the check, stated as a number. */
const DEEP_ZOOM = 20;

/** Simulated clock multiplier — vessels must have visibly reported. */
const HEALTH_URL = `${BASE}/maritime?sources=simulated&simSpeed=120&lon=3.38&lat=6.44&zoom=${DEEP_ZOOM}`;

async function readHealth(page: import("@playwright/test").Page): Promise<MapHealthSnapshot> {
  return page.evaluate(() => {
    const probe = (
      window as typeof window & { __seaphoreMapHealth?: () => MapHealthSnapshot }
    ).__seaphoreMapHealth;
    if (!probe) throw new Error("health probe absent");
    return probe();
  });
}

test.describe("deployment health · Live Command Map", () => {
  test("the deployed camera reaches zoom 20 and the map draws vessels", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(HEALTH_URL, { waitUntil: "domcontentloaded" });

    // The canvas host, then the probe. Separated so a failure says which
    // of "the page never mounted" and "the probe was compiled out" it is.
    await expect(page.getByTestId("map-canvas")).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(
      () => typeof (window as { __seaphoreMapHealth?: unknown }).__seaphoreMapHealth === "function",
      undefined,
      { timeout: 20_000 },
    );

    const mounted = await readHealth(page);
    expect(mounted.rendererDraws, "no real drawing engine attached").toBe(true);

    // 1 · Deep zoom. The build's own ceiling first — a deployment that
    // shipped a lower ceiling cannot possibly honour the request.
    expect(mounted.maxZoom, "deployed camera ceiling is below 20").toBeGreaterThanOrEqual(
      DEEP_ZOOM,
    );

    // Then the request, which had to survive the URL clamp, SGS, and the
    // scope's own range at the renderer.
    await page.waitForFunction(
      (target) => {
        const probe = (
          window as typeof window & { __seaphoreMapHealth?: () => { zoom: number } }
        ).__seaphoreMapHealth;
        return !!probe && probe().zoom >= target;
      },
      DEEP_ZOOM,
      { timeout: 20_000 },
    );

    // 2 · Simulated vessels are held and drawn. Polled rather than read
    // once: the provider reports on an interval, so zero at mount is
    // expected and only a sustained zero is a failure.
    await page.waitForFunction(
      () => {
        const probe = (
          window as typeof window & { __seaphoreMapHealth?: () => { vesselCount: number } }
        ).__seaphoreMapHealth;
        return !!probe && probe().vesselCount > 0;
      },
      undefined,
      { timeout: 30_000 },
    );

    const settled = await readHealth(page);
    expect(settled.sources, "simulated provider not enabled").toContain("simulated");
    expect(settled.zoom).toBeGreaterThanOrEqual(DEEP_ZOOM);
    expect(settled.vesselCount).toBeGreaterThan(0);

    /*
     * Tile requests for supplemental imagery legitimately 404 over open
     * water, and the renderer already suppresses that specific case. Any
     * other console error on the deployed map is a health failure.
     */
    const unexpected = consoleErrors.filter(
      (text) => !/blankTile=false|geographic-context|favicon/i.test(text),
    );
    expect(unexpected, `console errors on the deployed map: ${unexpected.join(" · ")}`).toEqual([]);
  });
});
