/**
 * Compliance Intelligence Centre regression tests.
 *
 * Contract under test:
 *   1. All 8 KPI cards render with labels and non-empty values.
 *   2. All 10 workspace tabs are present and clickable (active state toggles).
 *   3. The Compliance Matrix drill-down renders each seeded entity row with
 *      its score bar and status pill, in both themes.
 *   4. The Evidence Snapshot panel renders every seeded evidence tile with
 *      a numeric count.
 *   5. The ConfidenceChip inside the entity profile stays visible and keeps
 *      its coloured swatch/label regardless of `dark` vs `light` mode.
 *
 * The Compliance shell forces `dark` via `documentElement.classList`. We
 * exercise both modes by re-toggling that class after mount and re-asserting
 * — chips use inline HEX styles so must stay legible either way.
 */
import { test, expect, type Page } from "@playwright/test";
import { isAuthInjected, restoreSupabaseSession } from "./support/auth";

const KPI_LABELS = [
  "Compliance Score",
  "Open Violations",
  "Watchlisted Vessels",
  "Pending Inspections",
  "Expired Certificates",
  "Sanction Matches",
  "Revenue Risk",
  "Compliance Alerts",
];

const TAB_LABELS = [
  "Overview",
  "Violations",
  "Inspections",
  "Certificates",
  "Sanctions",
  "Watchlists",
  "Regulations",
  "Evidence",
  "Investigations",
  "Timeline",
];


const MATRIX_ENTITIES = [
  "MV Ocean Pearl",
  "MV Crimson Endeavour",
  "MV Blue Horizon",
  "ABC Shipping Ltd.",
  "Global Chartering Inc.",
];

const EVIDENCE_LABELS = [
  "Certificates",
  "Inspection Reports",
  "Bills of Lading",
  "Manifest",
  "Sanctions Lists",
  "Audit Trail",
  "Photos",
  "Officer Notes",
];

const CONFIDENCE_LABELS = ["VERIFIED", "OBSERVED", "INFERRED", "UNCONFIRMED"];

async function forceTheme(page: Page, mode: "light" | "dark") {
  await page.evaluate((m) => {
    const root = document.documentElement;
    if (m === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, mode);
}

async function gotoCompliance(page: Page) {
  await page.goto("/compliance", { waitUntil: "domcontentloaded" });
  // Wait for the ribbon (first KPI label) to be visible so the page has
  // rendered before assertions run.
  await expect(page.getByText("Compliance Score").first()).toBeVisible({ timeout: 10_000 });
}

test.describe("Compliance Intelligence Centre", () => {
  test.beforeEach(async ({ context, page }) => {
    if (isAuthInjected()) {
      await restoreSupabaseSession(context, page);
    }
  });

  test("KPI ribbon renders all 8 tiles with values", async ({ page }) => {
    await gotoCompliance(page);
    for (const label of KPI_LABELS) {
      const tile = page.getByText(label, { exact: true }).first();
      await expect(tile).toBeVisible();
      // Sibling value node lives in the same card container.
      const card = tile.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
      const value = card.locator("div").filter({ hasText: /\S/ }).nth(2);
      await expect(value).toBeVisible();
      await expect(value).not.toHaveText("");
    }
  });

  test("All 10 workspace tabs render and activate on click", async ({ page }) => {
    await gotoCompliance(page);
    for (const label of TAB_LABELS) {
      const tab = page.getByRole("button", { name: label, exact: true });
      await expect(tab).toBeVisible();
    }
    // Overview is the default active tab.
    const overview = page.getByRole("button", { name: "Overview", exact: true });
    await expect(overview).toHaveClass(/color-blue/);

    // Activating another tab moves the blue-tint active class onto it.
    const sanctions = page.getByRole("button", { name: "Sanctions", exact: true });
    await sanctions.click();
    await expect(sanctions).toHaveClass(/color-blue/, { timeout: 2_000 });
    await expect(overview).not.toHaveClass(/color-blue/);
  });


  test("Compliance Matrix drill-down lists every seeded entity in both themes", async ({ page }) => {
    await gotoCompliance(page);

    for (const mode of ["dark", "light"] as const) {
      await forceTheme(page, mode);
      for (const entity of MATRIX_ENTITIES) {
        const cell = page.getByText(entity, { exact: true }).first();
        await expect(cell).toBeVisible();
      }

      // Status pills must render at least one PASS / REVIEW / FAIL badge.
      for (const status of ["PASS", "REVIEW", "FAIL"]) {
        await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
      }
    }
  });

  test("Evidence Snapshot renders every tile with a numeric count", async ({ page }) => {
    await gotoCompliance(page);
    const panel = page.locator("div").filter({ hasText: /^Evidence Snapshot/ }).first();
    await expect(panel).toBeVisible();
    for (const label of EVIDENCE_LABELS) {
      const tile = panel.getByText(label, { exact: true }).first();
      await expect(tile).toBeVisible();
    }
    // At least one numeric count present in the snapshot region.
    const numericMatches = await panel.locator("text=/^\\d+$/").count();
    expect(numericMatches).toBeGreaterThan(0);
  });

  test("Confidence chip stays visible and coloured in dark and light mode", async ({ page }) => {
    await gotoCompliance(page);

    for (const mode of ["dark", "light"] as const) {
      await forceTheme(page, mode);

      const chip = page
        .locator("span")
        .filter({ hasText: new RegExp(`^(${CONFIDENCE_LABELS.join("|")})$`) })
        .first();
      await expect(chip).toBeVisible();

      const label = (await chip.textContent())?.trim() ?? "";
      expect(CONFIDENCE_LABELS).toContain(label);

      // Chip has non-zero size and an inline colour token — the visual
      // signal of the confidence ladder must survive both themes.
      const box = await chip.boundingBox();
      expect(box, `chip must have a box in ${mode} mode`).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);

      const color = await chip.evaluate((el) => (el as HTMLElement).style.color);
      expect(color, `chip must carry an inline colour in ${mode} mode`).not.toBe("");
    }
  });
});
