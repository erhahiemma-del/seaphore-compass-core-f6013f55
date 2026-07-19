/**
 * Sticky search input regression tests.
 *
 * Contract under test:
 *   Every searchable dropdown / combobox must keep its search input pinned
 *   at the top of the popover while its option list scrolls independently,
 *   in both light and dark themes.
 *
 * Coverage:
 *   1. Evidence Library `MultiSelectFilter` popovers — currently the only
 *      in-product searchable dropdowns. We open each real facet trigger
 *      (located via a stable `data-testid`), scroll its option list to the
 *      bottom, and assert the input's bounding box has not moved and is
 *      still fully inside the popover.
 *   2. Shared shadcn `CommandInput` primitive — verified via a structural
 *      contract test (tests/unit/command-sticky.test.ts) because the
 *      primitive has no live consumer yet but its `sticky top-0` styling
 *      must not regress.
 */
import { test, expect } from "@playwright/test";
import { isAuthInjected, restoreSupabaseSession } from "./support/auth";

const THEMES = ["light", "dark"] as const;

// data-testid values emitted by MultiSelectFilter (see filters.tsx).
const FILTER_TESTIDS = [
  "filter-trigger-evidence-type",
  "filter-trigger-confidence-level",
  "filter-trigger-investigation",
  "filter-trigger-entity",
  "filter-trigger-port",
  "filter-trigger-uploaded-by",
  "filter-trigger-classification",
  "filter-trigger-tags",
];

test.describe("Searchable dropdowns keep the search input pinned", () => {
  test.beforeEach(async ({ context, page }) => {
    test.skip(!isAuthInjected(), "No injected Supabase session — cannot reach _authenticated routes");
    await restoreSupabaseSession(context, page);
  });

  for (const theme of THEMES) {
    test(`Evidence Library filter popovers stay sticky (${theme} mode)`, async ({ page }) => {
      await page.goto("/evidence", { waitUntil: "networkidle" });

      // Force the theme regardless of the shell's default `mode` prop.
      await page.evaluate((mode) => {
        const root = document.documentElement;
        if (mode === "dark") root.classList.add("dark");
        else root.classList.remove("dark");
      }, theme);

      // Wait until the filter sidebar has rendered AND hydration completes —
      // React must attach event handlers before Radix Popover triggers work.
      const anchor = page.getByTestId("filter-trigger-evidence-type");
      await expect(anchor).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);


      let assertedAny = false;

      for (const id of FILTER_TESTIDS) {
        const trigger = page.getByTestId(id);
        if (!(await trigger.isVisible().catch(() => false))) continue;

        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();

        // Scope everything to the open Radix popper so we never pick up
        // stray inputs (top search, sidebar filter-search, etc).
        const popover = page.locator("[data-radix-popper-content-wrapper]").last();
        await expect(popover).toBeVisible();

        const input = popover.locator('input[placeholder^="Search "]');
        await expect(input).toBeVisible();

        const listbox = popover.locator('[role="listbox"][aria-multiselectable="true"]');
        await expect(listbox).toBeVisible();

        // Contract: input stays pinned to the TOP of the popover (relative
        // offset ≈ 0) even after the option list scrolls. We compare the
        // input's offset within the popover, not its absolute viewport y —
        // Radix may reposition the whole popover if the option list resizes,
        // which is fine as long as the input stays at the top inside it.
        // Wait a beat so the Radix open animation is complete before we
        // capture the baseline offset (scale/translate can shift measured y).
        await page.waitForTimeout(250);
        const offsetBefore = await popover.evaluate((pop, sel) => {
          const inp = pop.querySelector(sel) as HTMLElement;
          return inp.getBoundingClientRect().top - pop.getBoundingClientRect().top;
        }, 'input[placeholder^="Search "]');

        // Scroll the option list container all the way down. If there are
        // few options this is a no-op — the invariant still holds.
        await listbox.evaluate((el) => { el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(200);


        const offsetAfter = await popover.evaluate((pop, sel) => {
          const inp = pop.querySelector(sel) as HTMLElement;
          return inp.getBoundingClientRect().top - pop.getBoundingClientRect().top;
        }, 'input[placeholder^="Search "]');

        // Allow small sub-pixel jitter (Radix collision padding / anim).
        expect(Math.abs(offsetAfter - offsetBefore)).toBeLessThanOrEqual(4);


        // The input must sit at the top of the popover (within padding).
        expect(offsetAfter).toBeLessThanOrEqual(16);

        // And it must sit at or above the top of the option list — the
        // actual "pinned at the top" contract.
        const after = await input.boundingBox();
        const listBox = await listbox.boundingBox();
        expect(after).not.toBeNull();
        expect(listBox).not.toBeNull();
        expect(after!.y + after!.height).toBeLessThanOrEqual(listBox!.y + 1);


        // Typing must still hit the input (it can't have been detached).
        await input.fill("z");
        await expect(input).toHaveValue("z");
        await input.fill("");

        await page.keyboard.press("Escape");
        // Wait for the popover to actually close before opening the next.
        await expect(popover).toBeHidden({ timeout: 2_000 }).catch(() => {});
        assertedAny = true;
      }

      expect(assertedAny, "Expected at least one filter dropdown to open").toBe(true);
    });
  }

  test("rapid typing does not shift the popover search input", async ({ page }) => {
    await page.goto("/evidence", { waitUntil: "networkidle" });
    const trigger = page.getByTestId("filter-trigger-evidence-type");
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await trigger.click();


    const popover = page.locator("[data-radix-popper-content-wrapper]").last();
    const input = popover.locator('input[placeholder^="Search "]');
    await expect(input).toBeVisible();

    const offsetOf = () => popover.evaluate((pop, sel) => {
      const inp = pop.querySelector(sel) as HTMLElement;
      return inp.getBoundingClientRect().top - pop.getBoundingClientRect().top;
    }, 'input[placeholder^="Search "]');

    const before = await offsetOf();
    for (const ch of "abcdefghijk") await input.press(ch);
    await page.waitForTimeout(400); // let debounce settle & any reflow finish
    const after = await offsetOf();
    // Input stays pinned at the top of the popover regardless of typing.
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });
});

