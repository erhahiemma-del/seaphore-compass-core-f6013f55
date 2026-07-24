/**
 * UX-001 · Copilot conversational E2E.
 *
 * Drives the /copilot workspace end-to-end and verifies the two
 * behaviours the sprint mandates:
 *
 *   1. First turn — a bare entity query ("Tell me about MV Ocean Pearl")
 *      renders a full Executive Operational Briefing, NOT a
 *      "COPILOT NEEDS ONE DETAIL" clarification card.
 *   2. Follow-up chips — "Suggested next questions" render under the
 *      briefing and clicking one issues a second turn that stays on the
 *      same sticky subject.
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
  // The textarea is the single Copilot input in this route.
  await expect(page.getByPlaceholder("Ask an operational question…")).toBeVisible({
    timeout: 10_000,
  });
}

async function askCopilot(page: Page, query: string) {
  const input = page.getByPlaceholder("Ask an operational question…");
  await input.click();
  await input.fill(query);
  await input.press("Enter");
}

test.describe("Copilot · first-turn Executive Operational Briefing", () => {
  test.beforeEach(async ({ page }) => {
    await activateDevBypass(page);
    await openCopilot(page);
  });

  test("bare vessel mention renders a briefing (no clarification card)", async ({
    page,
  }) => {
    await askCopilot(page, "Tell me about MV Ocean Pearl");

    // The briefing region carries an "Ask another" affordance and a
    // "Briefing" ID label — both are only rendered by the briefing turn.
    await expect(page.getByRole("button", { name: "Ask another" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/^Briefing\s+/i)).toBeVisible();

    // The clarification card ("COPILOT NEEDS ONE DETAIL" / "Which one?"
    // / "I need one more detail") must NOT render.
    await expect(
      page.getByText(/copilot needs one detail/i),
    ).toHaveCount(0);
    await expect(page.getByText(/i need one more detail/i)).toHaveCount(0);

    // Follow-up chips replace the workflow buttons.
    await expect(
      page.getByText(/suggested next questions/i),
    ).toBeVisible();

    // The sticky-subject pill locks the anchor to the resolved vessel.
    await expect(
      page.getByText(/follow-ups continue on this vessel/i),
    ).toBeVisible();
    await expect(page.getByText(/Ocean Pearl/i).first()).toBeVisible();
  });

  test("truly ambiguous input still shows a clarification", async ({ page }) => {
    await askCopilot(page, "help");

    // Either a clarify card renders OR the officer sees a copilot-side
    // question — either way, no full briefing on this turn.
    await expect(page.getByRole("button", { name: "Ask another" })).toHaveCount(0);
    await expect(
      page.getByText(
        /needs one detail|which (one|vessel)|i need one more detail|clarif/i,
      ),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Copilot · follow-up chips keep the sticky subject", () => {
  test.beforeEach(async ({ page }) => {
    await activateDevBypass(page);
    await openCopilot(page);
  });

  test("clicking a suggested next question issues a second briefing on the same vessel", async ({
    page,
  }) => {
    await askCopilot(page, "Tell me about MV Ocean Pearl");

    // First turn settled.
    await expect(page.getByRole("button", { name: "Ask another" })).toBeVisible({
      timeout: 20_000,
    });
    const chipsRegion = page
      .locator("div", { hasText: /suggested next questions/i })
      .last();
    await expect(chipsRegion).toBeVisible();

    // Grab the first follow-up chip label so the assertion is
    // independent of the exact suggestion strings (they can vary with
    // the planner's follow-ups).
    const firstChip = chipsRegion.getByRole("button").first();
    await expect(firstChip).toBeVisible();
    const chipLabel = (await firstChip.textContent())?.trim() ?? "";
    expect(chipLabel.length).toBeGreaterThan(0);

    await firstChip.click();

    // The workspace clears and re-renders the streaming stages, then
    // yields a NEW briefing that still resolves against MV Ocean Pearl.
    await expect(page.getByRole("button", { name: "Ask another" })).toBeVisible({
      timeout: 20_000,
    });

    // Mission conversation shows both turns — officer asked, copilot
    // replied — and the subject pill is still anchored on the vessel.
    await expect(page.getByText(/mission conversation/i)).toBeVisible();
    await expect(page.getByText(/Ocean Pearl/i).first()).toBeVisible();
    await expect(
      page.getByText(/follow-ups continue on this vessel/i),
    ).toBeVisible();

    // The clarify card must NEVER have appeared during the flow.
    await expect(
      page.getByText(/copilot needs one detail/i),
    ).toHaveCount(0);
  });
});
