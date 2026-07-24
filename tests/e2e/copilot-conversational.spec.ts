/**
 * UX-001 · Copilot conversational E2E.
 *
 * Drives the /copilot workspace end-to-end and verifies the two
 * behaviours the sprint mandates:
 *
 *   1. First turn — a bare entity query ("Tell me about MV Ocean Pearl")
 *      renders a full Executive Operational Briefing, NOT a
 *      "Copilot · needs one detail" clarification card.
 *   2. Follow-up chips — the "Suggested next questions" panel renders
 *      under the briefing, and clicking one issues a second turn that
 *      also comes back as a briefing (no clarification card).
 *
 * The Copilot is exercised through the dev-bypass path
 * (`useIsDevBypass()` → runOIE client-side), so the full UI cycle is
 * covered without needing a real Supabase session in the sandbox. The
 * workspace still goes through the interpreter → resolver → planner →
 * orchestrator → response generator chain, just against the local
 * mock providers.
 */
import { test, expect, type Page } from "@playwright/test";

const DEV_MODE_STORAGE_KEY = "seaphore.dev-mode.v2";
const DEV_MODE_VALUE = JSON.stringify({
  state: { bypassAuth: true, mockRole: "officer" },
  version: 0,
});
const INPUT_PLACEHOLDER =
  "Investigate vessels, manifests, cargo, ownership, operators, ports, compliance or maritime risk…";
const CLARIFY_HEADER = /needs one detail/i;
const FOLLOW_UPS_HEADER = /suggested next questions/i;
// The AdaptiveBriefing renderer emits an "Executive Assessment" section
// heading — used here as the "briefing has settled" signal. We avoid
// matching the footer's "OFFICER DECIDES" tagline because it renders on
// every page and would produce a false positive.
const EXECUTIVE_SECTION = /executive assessment/i;

async function activateDevBypass(page: Page) {
  // Land on any page first so localStorage is scoped to localhost:8080,
  // then seed the persisted zustand store the Copilot reads.
  await page.goto("/");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [DEV_MODE_STORAGE_KEY, DEV_MODE_VALUE],
  );
}

async function openCopilot(page: Page) {
  await page.goto("/copilot");
  await expect(page.getByPlaceholder(INPUT_PLACEHOLDER)).toBeVisible({
    timeout: 15_000,
  });
}

async function askCopilot(page: Page, query: string) {
  const input = page.getByPlaceholder(INPUT_PLACEHOLDER);
  await input.click();
  await input.fill(query);
  await input.press("Enter");
}

test.describe("Copilot · conversational intelligence (/copilot)", () => {
  test.beforeEach(async ({ page }) => {
    await activateDevBypass(page);
    await openCopilot(page);
  });

  test("bare vessel mention renders a briefing (no clarification card)", async ({
    page,
  }) => {
    await askCopilot(page, "Tell me about MV Ocean Pearl");

    // Wait for the briefing to settle. The immutable officer-decision
    // notice is only emitted by the Adaptive Briefing renderer.
    await expect(page.getByText(EXECUTIVE_SECTION)).toBeVisible({
      timeout: 25_000,
    });

    // Follow-up chips replace the workflow buttons.
    await expect(page.getByText(FOLLOW_UPS_HEADER)).toBeVisible();

    // The clarification card must NOT render on a bare entity query.
    await expect(page.getByText(CLARIFY_HEADER)).toHaveCount(0);
  });

  test("clicking a suggested next question issues a second briefing, still no clarification", async ({
    page,
  }) => {
    await askCopilot(page, "Tell me about MV Ocean Pearl");

    // First turn settled.
    await expect(page.getByText(EXECUTIVE_SECTION)).toBeVisible({
      timeout: 25_000,
    });
    const chipsRegion = page.locator("div", { hasText: FOLLOW_UPS_HEADER }).last();
    await expect(chipsRegion).toBeVisible();

    // Grab the first follow-up chip label so the assertion is
    // independent of the exact suggestion strings — the planner's
    // follow-up list can evolve without breaking this test.
    const firstChip = chipsRegion.getByRole("button").first();
    await expect(firstChip).toBeVisible();
    const chipLabel = (await firstChip.textContent())?.trim() ?? "";
    expect(chipLabel.length).toBeGreaterThan(0);

    await firstChip.click();

    // The streaming stage clears the previous briefing while it runs.
    // Wait until a fresh briefing settles (the officer-decision notice
    // reappears) and confirm no clarification card ever intervened.
    await expect(page.getByText(EXECUTIVE_SECTION)).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(FOLLOW_UPS_HEADER)).toBeVisible();
    await expect(page.getByText(CLARIFY_HEADER)).toHaveCount(0);
  });
});
