/**
 * Sprint UX-02 · Investigation Landing E2E.
 *
 * Two guarantees are locked here:
 *
 *   1. The empty state fits — the officer sees the hero prompt AND all
 *      six Quick Start cards without scrolling the workspace column.
 *   2. Each Quick Start card inserts its exact prompt into the command
 *      bar and leaves it there for officer review (never auto-submits).
 *
 * Runs against the dev-bypass session so no real Supabase login is
 * needed inside the sandbox.
 */
import { test, expect, type Page } from "@playwright/test";

const DEV_MODE_STORAGE_KEY = "seaphore.dev-mode.v2";
const DEV_MODE_VALUE = JSON.stringify({
  state: { bypassAuth: true, mockRole: "officer" },
  version: 0,
});

const QUICK_START: Array<[label: string, prompt: (subject: string) => string]> = [
  ["Investigate Vessel", (s) => `Investigate ${s}`],
  ["Ownership", (s) => `Explain the ownership structure of ${s}`],
  ["Sanctions", (s) => `Screen ${s} and its operator for sanctions exposure`],
  ["Cargo", (s) => `Analyze the cargo and manifests for ${s}`],
  ["AIS Replay", (s) => `Check AIS activity and dark periods for ${s}`],
  ["Revenue", (s) => `Assess revenue leakage risk for ${s}`],
];

async function openLanding(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [DEV_MODE_STORAGE_KEY, DEV_MODE_VALUE],
  );
  await page.goto("/copilot");
  await expect(page.getByText(/what would you like to investigate\?/i)).toBeVisible();
  await expect(page.getByText(/^Quick Start$/)).toBeVisible();
}

/** The subject the landing personalises its prompts with. */
async function subjectOf(page: Page): Promise<string> {
  const placeholder = await page
    .getByLabel(/investigation query/i)
    .getAttribute("placeholder");
  return (placeholder ?? "").replace(/^Investigate\s+/, "").replace(/\.\.\.$/, "").trim();
}

test.describe("Investigation Landing — empty state", () => {
  test("fits without scrolling and shows all six Quick Start cards", async ({ page }) => {
    await openLanding(page);

    for (const [label] of QUICK_START) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    // The workspace column must not overflow: no scrollbar in the empty state.
    const overflow = await page.evaluate(() => {
      const scroller = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
        (el) =>
          getComputedStyle(el).overflowY === "auto" &&
          el.textContent?.includes("Quick Start"),
      );
      if (!scroller) return null;
      return { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight };
    });

    expect(overflow, "workspace scroll container not found").not.toBeNull();
    // 1px tolerance for sub-pixel layout rounding.
    expect(overflow!.scrollHeight).toBeLessThanOrEqual(overflow!.clientHeight + 1);
  });
});

test.describe("Investigation Landing — Quick Start prompts", () => {
  for (const [label, prompt] of QUICK_START) {
    test(`"${label}" inserts the correct prompt`, async ({ page }) => {
      await openLanding(page);
      const subject = await subjectOf(page);
      const input = page.getByLabel(/investigation query/i);

      await page.getByRole("button", { name: label, exact: true }).click();

      await expect(input).toHaveValue(prompt(subject));
      // Staged, not submitted — the landing hero is still on screen.
      await expect(page.getByText(/what would you like to investigate\?/i)).toBeVisible();
      await expect(input).toBeFocused();
    });
  }
});
