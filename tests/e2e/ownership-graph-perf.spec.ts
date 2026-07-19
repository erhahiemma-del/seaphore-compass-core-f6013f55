/**
 * Ownership Network Graph — end-to-end stress test.
 *
 * Drives the live /ownership route and exercises the three interaction
 * surfaces most sensitive to Supabase dataset growth:
 *
 *   • Pan + zoom     — repeated mouse drags and zoom-button clicks.
 *   • Relationship   — rapid toggling of every checkbox in the sidebar.
 *   • Timeline       — full-range slider scrub, one frame per year.
 *
 * We measure each burst inside the browser with `performance.now()` and
 * assert wall-clock budgets. Thresholds are intentionally generous so a
 * genuine regression (multi-second freezes, dropped frames on scrub) trips
 * the test without flaking on shared CI hardware.
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoOwnership(page: Page) {
  await page.goto("/ownership", { waitUntil: "domcontentloaded" });
  // Wait for the network graph SVG to be present before we start clicking.
  await page.locator('svg[viewBox="0 0 900 460"]').first().waitFor({ timeout: 15_000 });
}

test.describe("Ownership Network Graph — stress", () => {
  test("pan + zoom bursts stay responsive", async ({ page }) => {
    await gotoOwnership(page);

    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    const zoomOut = page.getByRole("button", { name: "Zoom out" });
    const reset = page.getByRole("button", { name: "Reset" });

    const elapsed = await page.evaluate(async () => {
      const t = performance.now();
      // Simulate 30 pan drags across the graph surface.
      const surface = document.querySelector('svg[viewBox="0 0 900 460"]')
        ?.parentElement as HTMLElement | null;
      if (!surface) return -1;
      const rect = surface.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      for (let i = 0; i < 30; i++) {
        surface.dispatchEvent(new MouseEvent("mousedown", { clientX: cx, clientY: cy, bubbles: true }));
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: cx + i * 4, clientY: cy + i * 2, bubbles: true }));
        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      }
      return performance.now() - t;
    });
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(2_000);

    // Chained zoom bursts — 12 clicks, alternating directions.
    const burstStart = Date.now();
    for (let i = 0; i < 6; i++) {
      await zoomIn.click({ noWaitAfter: true });
      await zoomOut.click({ noWaitAfter: true });
    }
    await reset.click();
    expect(Date.now() - burstStart).toBeLessThan(5_000);

    // Graph must still be mounted and interactive.
    await expect(page.locator('svg[viewBox="0 0 900 460"]').first()).toBeVisible();
  });

  test("relationship filter toggles complete inside interaction budget", async ({ page }) => {
    await gotoOwnership(page);

    const labels = ["Ownership", "Director", "Shareholder", "Operator", "Manager", "Other"];

    const start = Date.now();
    // Toggle every relation off, then back on — two full passes.
    for (let pass = 0; pass < 2; pass++) {
      for (const label of labels) {
        const box = page.getByLabel(label, { exact: true }).first();
        // Some labels overlap sidebar copy; use force + noWaitAfter so we
        // never block on transitions the graph doesn't own.
        await box.click({ force: true, noWaitAfter: true }).catch(() => { /* tolerate */ });
      }
    }
    const elapsed = Date.now() - start;

    // 12 toggles must feel instant — well under 3s including React commit.
    expect(elapsed).toBeLessThan(3_000);
    await expect(page.locator('svg[viewBox="0 0 900 460"]').first()).toBeVisible();
  });

  test("timeline scrub across the full range stays smooth", async ({ page }) => {
    await gotoOwnership(page);

    const slider = page.getByLabel("Timeline year");
    await slider.focus();

    // Measure the full-range scrub inside the browser so React state
    // commit time is captured, not just Playwright dispatch time.
    const elapsed = await page.evaluate(async () => {
      const el = document.querySelector<HTMLInputElement>('input[aria-label="Timeline year"]');
      if (!el) return -1;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      const t = performance.now();
      for (let y = 2013; y <= 2026; y++) {
        setter?.call(el, String(y));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        // Yield to React so each frame commits before the next scrub step.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return performance.now() - t;
    });

    expect(elapsed).toBeGreaterThanOrEqual(0);
    // 14 year-steps × ~1 rAF each should land well under 1.5s on any host.
    expect(elapsed).toBeLessThan(1_500);
    await expect(page.locator('svg[viewBox="0 0 900 460"]').first()).toBeVisible();
  });

  test("combined burst — filter + scrub + zoom — never freezes the graph", async ({ page }) => {
    await gotoOwnership(page);

    const start = Date.now();
    // Interleave every interaction type to catch cross-memo invalidation.
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    const slider = page.getByLabel("Timeline year");

    for (let i = 0; i < 5; i++) {
      await zoomIn.click({ noWaitAfter: true });
      await page.getByLabel("Ownership", { exact: true }).first()
        .click({ force: true, noWaitAfter: true }).catch(() => {});
      await slider.evaluate((el, y) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value",
        )?.set;
        setter?.call(el, String(y));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, 2013 + i * 2);
    }
    await page.getByRole("button", { name: "Reset" }).click();

    expect(Date.now() - start).toBeLessThan(6_000);
    await expect(page.locator('svg[viewBox="0 0 900 460"]').first()).toBeVisible();
  });
});
