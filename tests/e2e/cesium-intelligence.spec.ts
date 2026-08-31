/**
 * Cesium 3D Intelligence — end-to-end smoke test.
 *
 * Covers the whole capability as an officer meets it:
 *   credential state → activation control → renderer mount →
 *   canonical vessel rendering → interaction → fallback to MapLibre.
 *
 * The test never handles a Cesium Ion token. It reads the *state* the
 * server reports (configured or not) and asserts the honest behaviour for
 * that state:
 *   - unconfigured  → the activation modal opens, MapLibre keeps drawing
 *   - configured    → the Cesium adapter mounts and draws the same vessels
 * In neither case may the map be blank.
 */
import { expect, test, type Page } from "@playwright/test";

import { isAuthInjected, restoreSupabaseSession } from "./support/auth";

const BASE = (process.env.SEAPHORE_HEALTH_URL ?? "http://localhost:8080").replace(/\/$/, "");
/** Simulated feed, asked for explicitly — never depend on a live provider. */
const MAP_URL = `${BASE}/maritime?vesselSource=simulated`;

interface MapSnapshot {
  rendererId: string | null;
  rendererStatus: string;
  rendererDraws: boolean;
  vesselCount: number;
  lastError: string | null;
}

async function snapshot(page: Page): Promise<MapSnapshot> {
  return page.evaluate(() => {
    const store = (
      window as unknown as {
        __SEAPHORE_MAP_SESSION__?: { getState(): MapSnapshot };
      }
    ).__SEAPHORE_MAP_SESSION__;
    return (
      store?.getState() ?? {
        rendererId: null,
        rendererStatus: "idle",
        rendererDraws: false,
        vesselCount: 0,
        lastError: null,
      }
    );
  });
}

test.describe("3D Intelligence (Cesium Ion)", () => {
  test.skip(!isAuthInjected(), "requires an injected officer session");

  test("activates, mounts or explains itself, and never shows a blank map", async ({
    page,
    context,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await restoreSupabaseSession(context, page);
    await page.goto(MAP_URL, { waitUntil: "domcontentloaded" });

    // The 2D operational map is the default and must be live first.
    await expect
      .poll(async () => (await snapshot(page)).rendererStatus, { timeout: 30_000 })
      .toBe("ready");
    const before = await snapshot(page);
    expect(before.rendererId).toBe("maplibre");
    expect(before.rendererDraws).toBe(true);
    await expect.poll(async () => (await snapshot(page)).vesselCount).toBeGreaterThan(0);

    const toggle = page.getByRole("button", { name: /3D Intelligence/i });
    await expect(toggle).toBeVisible();
    await toggle.click();

    /*
     * One of exactly two honest outcomes.
     *
     * Unconfigured credential: the activation modal is offered and
     * MapLibre keeps drawing. Configured credential: the Cesium adapter
     * takes over and reports itself ready.
     */
    const modal = page.getByRole("dialog").filter({ hasText: /Activate Cesium Ion/i });
    const outcome = await Promise.race([
      modal
        .waitFor({ state: "visible", timeout: 45_000 })
        .then(() => "activation" as const)
        .catch(() => "none" as const),
      expect
        .poll(async () => (await snapshot(page)).rendererId, { timeout: 45_000 })
        .toBe("cesium")
        .then(() => "mounted" as const)
        .catch(() => "none" as const),
    ]);

    expect(outcome, "3D toggle produced neither a mount nor an activation prompt").not.toBe("none");

    if (outcome === "activation") {
      // No credential is a configuration gap, stated as such.
      await expect(modal).toContainText(/no credential configured|Credential present/i);
      const still = await snapshot(page);
      expect(still.rendererId).toBe("maplibre");
      expect(still.rendererStatus).toBe("ready");
      return;
    }

    // Renderer mount: the same canonical vessels, drawn by the 3D engine.
    await expect
      .poll(async () => (await snapshot(page)).rendererStatus, { timeout: 60_000 })
      .toBe("ready");
    const live = await snapshot(page);
    expect(live.rendererId).toBe("cesium");
    expect(live.rendererDraws).toBe(true);
    expect(live.vesselCount).toBeGreaterThan(0);

    // Interaction: a click on the globe must not tear the surface down.
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();
    await canvas.click({ position: { x: 200, y: 200 } });
    expect((await snapshot(page)).rendererStatus).toBe("ready");

    // Fallback: leaving 3D restores MapLibre, still drawing, never blank.
    await page.getByRole("button", { name: /Exit 3D Intelligence/i }).click();
    await expect
      .poll(async () => (await snapshot(page)).rendererId, { timeout: 30_000 })
      .toBe("maplibre");
    await expect
      .poll(async () => (await snapshot(page)).rendererStatus, { timeout: 30_000 })
      .toBe("ready");

    // The credential must never reach the browser's durable storage.
    const leaked = await page.evaluate(() => {
      const haystack = [
        ...Object.keys(window.localStorage).map((k) => `${k}:${window.localStorage.getItem(k)}`),
        ...Object.keys(window.sessionStorage).map(
          (k) => `${k}:${window.sessionStorage.getItem(k)}`,
        ),
        window.location.href,
      ].join("\n");
      return /cesium[^\n]*(token|ion)/i.test(haystack) || /ionToken/.test(haystack);
    });
    expect(leaked, "a Cesium credential was found in browser storage or the URL").toBe(false);

    expect(consoleErrors.join("\n")).not.toMatch(/Ion|Cesium/i);
  });
});
